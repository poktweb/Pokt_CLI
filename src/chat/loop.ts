import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { ui } from '../ui.js';
import { runProFlow } from '../commands/pro.js';
import { ModelConfig, Provider, PROVIDER_LABELS, ALL_PROVIDERS } from '../config.js';
import { config } from '../config.js';
import { getClient } from './client.js';
import { tools, executeTool } from './tools.js';
import { saveAuto, loadAuto, listCheckpoints, saveCheckpoint, loadCheckpoint, deleteCheckpoint, exportConversation, getSessionsDir } from './sessions.js';
import {
  connectMcpServer,
  getAllMcpToolsOpenAI,
  callMcpTool,
  isMcpTool,
  disconnectAllMcp,
} from '../mcp/client.js';
import OpenAI from 'openai';
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
  ChatCompletion,
} from 'openai/resources/chat/completions/completions.js';

const SYSTEM_PROMPT = `You are Pokt CLI, an elite AI Software Engineer.
Your goal is to help the user build, fix, and maintain software projects with high quality.

CORE CAPABILITIES:
1.  **Project Understanding**: You can see the whole file structure and read any file.
2.  **Autonomous Coding**: You can create new files, rewrite existing ones, and run terminal commands.
3.  **Problem Solving**: You analyze errors and propose/apply fixes.

CRITICAL - FILE CREATION/EDITS (this API does NOT support tool calls):
- Do NOT reply with only "We will call read_file", "We will call write_file" or similar. Those tools will NOT run. The user will get no file.
- You MUST output the complete file content in a markdown code block so the CLI can create/edit the file. Format: mention the filename (e.g. hello.py or **hello.py**) then a newline then \`\`\`python then newline then the full file content then \`\`\`.
- For edits: first "read" the file by inferring its content from the user request and project context, then output the full updated file in a \`\`\`python (or correct language) block with the filename mentioned just above the block.
- Never end your response with only an intention to call a tool. Always include the actual code in a block.

GUIDELINES:
- You will receive the user request first, then the current project structure. Use the project structure to understand the context before creating or editing anything.
- When asked to fix something, first **read** the relevant files to understand the context.
- When creating a project, start by planning the structure, then use \`write_file\` to create each file.
- You have full access to the current terminal. You can run \`run_command\` for \`npm install\`, \`tsc\`, or any other command.
- Be extremely concise in your explanations.
- The current working directory is: ${process.cwd()}
`;

async function loadProjectStructure(): Promise<string> {
  try {
    const timeoutMs = 8000;
    return await Promise.race([
      executeTool('list_files', JSON.stringify({ path: '.' })),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      )
    ]);
  } catch {
    try {
      return await executeTool('list_directory', JSON.stringify({ path: '.' }));
    } catch {
      return 'Could not list files.';
    }
  }
}

export async function startChatLoop(modelConfig: ModelConfig) {
  let activeModel: ModelConfig = modelConfig;
  let client = await getClient(activeModel);

  // Conectar servidores MCP configurados e montar lista de tools (nativas + MCP)
  const mcpServers = config.get('mcpServers') ?? [];
  for (const server of mcpServers) {
    const session = await connectMcpServer(server);
    if (session) {
      console.log(ui.dim(`[MCP] Connected: ${session.serverName} (${session.tools.length} tools)`));
    }
  }
  const allTools: ChatCompletionTool[] = [
    ...tools,
    ...getAllMcpToolsOpenAI(),
  ];

  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  // Auto-resume do projeto (estilo gemini): se existir, adiciona mensagens anteriores (sem duplicar system prompt)
  const prev = loadAuto();
  if (prev && prev.length > 0) {
    for (const m of prev) {
      if (m.role === 'system') continue;
      messages.push({ role: m.role, content: m.content } as any);
    }
    console.log(ui.dim(`Sessão anterior carregada (projeto). Use /chat list | /chat save <tag>.`));
  }

  function modelLabel(m: ModelConfig): string {
    const provider = PROVIDER_LABELS[m.provider as Provider] ?? m.provider;
    return `[${provider}] ${m.id}`;
  }

  async function switchModelFlow(mode: 'model' | 'provider' = 'model') {
    const models = config.get('registeredModels') ?? [];
    if (!Array.isArray(models) || models.length === 0) {
      console.log(ui.error('Nenhum modelo registrado. Rode: pokt models list'));
      return;
    }

    const providerChoices = (ALL_PROVIDERS as readonly Provider[]).map((p) => {
      const label = PROVIDER_LABELS[p] ?? p;
      const hasAny = models.some((m: ModelConfig) => m.provider === p);
      const star = activeModel.provider === p ? '★ ' : '';
      return {
        title: `${star}${label}${hasAny ? '' : ' (sem modelos)'}`,
        value: p,
        disabled: !hasAny,
      };
    });

    const providerPick = await prompts({
      type: 'select',
      name: 'provider',
      message: mode === 'provider' ? 'Trocar provedor:' : 'Selecione o provedor:',
      choices: [...providerChoices, { title: '🔙 Cancelar', value: 'cancel' }],
    });
    if (!providerPick.provider || providerPick.provider === 'cancel') return;

    const provider = providerPick.provider as Provider;
    const providerModels = models.filter((m: ModelConfig) => m.provider === provider);
    if (providerModels.length === 0) {
      console.log(ui.error(`Sem modelos para ${PROVIDER_LABELS[provider] ?? provider}.`));
      return;
    }

    let selected: ModelConfig | null = null;
    if (mode === 'provider') {
      selected = providerModels[0];
    } else {
      const pick = await prompts({
        type: 'select',
        name: 'idx',
        message: `Modelos em ${PROVIDER_LABELS[provider] ?? provider}:`,
        choices: [
          ...providerModels.map((m: ModelConfig, i: number) => ({
            title: `${activeModel.provider === m.provider && activeModel.id === m.id ? '★ ' : ''}${m.id}`,
            value: i,
          })),
          { title: '🔙 Cancelar', value: 'cancel' },
        ],
      });
      if (pick.idx === 'cancel' || typeof pick.idx !== 'number') return;
      selected = providerModels[pick.idx] ?? null;
    }
    if (!selected) return;

    // Validar chaves/credenciais necessárias (reaproveita mesma lógica do providerCommand / getClient)
    try {
      const newClient = await getClient(selected);
      client = newClient;
    } catch (e: any) {
      console.log(ui.error(e?.message ?? String(e)));
      return;
    }

    activeModel = selected;
    config.set('activeModel', selected);
    console.log(ui.success(`Modelo ativo atualizado: ${modelLabel(selected)}`));
    console.log(ui.dim('Dica: o histórico do chat foi mantido; apenas o modelo/provedor mudou.'));
  }

  function printHelp() {
    console.log(
      ui.dim(`
Comandos do chat:
  ${ui.accent('/help')} — mostra esta ajuda
  ${ui.accent('/clear')} — limpa a tela
  ${ui.accent('/status')} — mostra modelo/provider atual
  ${ui.accent('/model')} — trocar modelo (menu interativo)
  ${ui.accent('/provider')} — trocar provedor (usa o 1º modelo disponível)
  ${ui.accent('/chat')} — checkpoints/sessões (list/save/resume/delete/share)
  ${ui.accent('/resume')} — alias de /chat
  ${ui.accent('/copy')} — copia a última resposta do Pokt (Windows: clip)
  ${ui.accent('/pro')} — abrir Pokt Pro no navegador
  ${ui.accent('/quit')} ou ${ui.accent('exit')} — sair do chat
`)
    );
  }

  let lastAssistantText = '';
  async function handleChatCommand(raw: string) {
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const sub = (parts[1] ?? 'list').toLowerCase();
    const arg = parts.slice(2).join(' ').trim();

    if (sub === 'dir') {
      console.log(ui.dim(`Sessões: ${getSessionsDir()}`));
      return;
    }
    if (sub === 'list') {
      const items = listCheckpoints();
      if (items.length === 0) {
        console.log(ui.dim('Nenhum checkpoint salvo ainda. Use: /chat save <tag>'));
        return;
      }
      console.log(ui.dim('Checkpoints:'));
      for (const it of items) {
        console.log(`- ${ui.accent(it.tag)} ${it.updatedAt ? ui.dim(`(${it.updatedAt})`) : ''}`);
      }
      return;
    }
    if (sub === 'save') {
      if (!arg) {
        console.log(ui.error('Uso: /chat save <tag>'));
        return;
      }
      saveCheckpoint(arg, messages);
      console.log(ui.success(`Checkpoint salvo: ${arg}`));
      return;
    }
    if (sub === 'resume' || sub === 'load') {
      if (!arg) {
        console.log(ui.error('Uso: /chat resume <tag>'));
        return;
      }
      const loaded = loadCheckpoint(arg);
      // mantém system prompt; substitui resto
      const sys = messages[0];
      messages.length = 0;
      messages.push(sys);
      for (const m of loaded) {
        if (m.role === 'system') continue;
        messages.push({ role: m.role, content: m.content } as any);
      }
      console.log(ui.success(`Checkpoint carregado: ${arg}`));
      return;
    }
    if (sub === 'delete' || sub === 'rm') {
      if (!arg) {
        console.log(ui.error('Uso: /chat delete <tag>'));
        return;
      }
      deleteCheckpoint(arg);
      console.log(ui.success(`Checkpoint removido: ${arg}`));
      return;
    }
    if (sub === 'share' || sub === 'export') {
      const filename = arg || `pokt-chat-${Date.now()}.md`;
      const out = exportConversation(filename, messages);
      console.log(ui.success(`Exportado: ${out}`));
      return;
    }

    console.log(ui.warn(`Subcomando desconhecido: ${sub}. Use /chat list|save|resume|delete|share`));
  }

  while (true) {
    console.log('');
    const cwd = process.cwd();
    console.log(ui.dim(`Diretório atual: ${cwd}`));
    console.log(ui.shortcutsLine(undefined, '? · /help · /pro'));
    const response = await prompts({
      type: 'text',
      name: 'input',
      message: '>',
      initial: '',
      style: 'default'
    });

    const userInput = response.input;
    if (!userInput || userInput.toLowerCase() === 'exit' || userInput.trim().toLowerCase() === '/quit') {
      await disconnectAllMcp();
      console.log(ui.dim('Goodbye!'));
      break;
    }

    const trimmed = userInput.trim();
    const low = trimmed.toLowerCase();
    if (low === '/help' || low === '/?' || low === 'help') {
      printHelp();
      continue;
    }
    if (low === '/clear') {
      console.clear();
      continue;
    }
    if (low === '/status') {
      console.log(ui.statusBar({ cwd: process.cwd(), model: `/model ${activeModel.provider} (${activeModel.id})` }));
      continue;
    }
    if (low.startsWith('/chat') || low.startsWith('/resume')) {
      await handleChatCommand(trimmed.replace(/^\/resume/i, '/chat'));
      continue;
    }
    if (low === '/copy') {
      try {
        if (!lastAssistantText) {
          console.log(ui.warn('Nada para copiar ainda.'));
          continue;
        }
        // Sem interpolar conteúdo no comando (evita quebra por aspas/newlines).
        // Escreve para um arquivo temporário e copia via Get-Content | clip (Windows).
        const tmp = `.pokt_copy_${Date.now()}.txt`;
        await executeTool('write_file', JSON.stringify({ path: tmp, content: lastAssistantText }));
        await executeTool(
          'run_command',
          JSON.stringify({ command: `powershell -NoProfile -Command "Get-Content -Raw '${tmp}' | clip"` })
        );
        // best-effort cleanup
        try {
          await executeTool('delete_file', JSON.stringify({ path: tmp }));
        } catch {
          // ignore
        }
        console.log(ui.success('Copiado para a área de transferência.'));
      } catch {
        console.log(ui.warn('Falha ao copiar. Se estiver no Windows, verifique se o comando "clip" está disponível.'));
      }
      continue;
    }
    if (low === '/model') {
      await switchModelFlow('model');
      continue;
    }
    if (low === '/provider') {
      await switchModelFlow('provider');
      continue;
    }
    if (low === '/pro' || low === '/torne-se-pro' || low === 'torne-se pro') {
      runProFlow();
      continue;
    }
    if (trimmed === '?') {
      console.log(
        ui.dim(`
Atalhos:
  ${ui.accent('/pro')} ou ${ui.accent('/torne-se-pro')} — abrir Pokt Pro no navegador (pagamento + chave)
  exit, ${ui.accent('/quit')} — sair do chat
  ${ui.accent('/help')} — ver comandos do chat
`)
      );
      continue;
    }

    messages.push({ role: 'user', content: userInput });
    saveAuto(messages);

    // Primeiro o modelo vê o pedido; depois carregamos a estrutura do projeto para ele entender e então criar/editar
    const isFirstUserMessage = messages.filter(m => m.role === 'user').length === 1;
    if (isFirstUserMessage) {
      const loadSpinner = ora('Carregando estrutura do projeto...').start();
      const projectStructure = await loadProjectStructure();
      loadSpinner.stop();
      messages.push({ role: 'system', content: `Current Project Structure:\n${projectStructure}` });
    }

    await processLLMResponse(client, activeModel.id, messages, allTools);
    // Atualiza auto-save após resposta
    saveAuto(messages);
    // Captura última resposta do assistente para /copy (melhor esforço)
    for (let i = messages.length - 1; i >= 0; i--) {
      const m: any = messages[i];
      if (m?.role === 'assistant') {
        const c = m.content;
        lastAssistantText = typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: any) => (p && p.text ? p.text : String(p))).join('') : String(c ?? '');
        break;
      }
    }
  }
  await disconnectAllMcp();
}

const MAX_429_RETRIES = 3;
const BASE_429_DELAY_MS = 5000;

/** Extensões que consideramos como arquivos de código para aplicar fallback */
const CODE_EXT = /\.(py|js|ts|tsx|jsx|html|css|json|md|txt|java|go|rs|c|cpp|rb|php)$/i;

/**
 * Quando a API não retorna tool_calls, alguns backends só devolvem texto.
 * Extrai blocos de código da resposta (```lang\n...\n```) e, se encontrar
 * um nome de arquivo mencionado antes do bloco, aplica write_file.
 */
/** Blocos de comando "como rodar" (bash/sh de 1–2 linhas) não viram arquivo para não poluir. */
function isRunCommandOnly(lang: string, code: string): boolean {
  const shellLike = /^(bash|sh|shell|zsh)$/i.test(lang);
  const lines = code.split('\n').filter((l) => l.trim().length > 0);
  return shellLike && lines.length <= 2;
}

/** Remove markdown/formatting do nome de arquivo (ex: **hello.py** → hello.py). */
function cleanFilename(candidate: string): string {
  return candidate.replace(/^[\s*`'"]+/g, '').replace(/[\s*`'")\]\s]+$/g, '').trim();
}

/**
 * Aplica blocos de código da resposta e retorna conteúdo para exibição (sem repetir o código).
 * - Detecta nome de arquivo na mensagem (ex: "updated **hello.py**") para editar o existente.
 * - Blocos já aplicados são substituídos por "[Código aplicado ao arquivo: path]" na mensagem exibida.
 */
/** Garante que o conteúdo da mensagem seja string (algumas APIs devolvem array). */
function messageContentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => (typeof part === 'object' && part != null && 'text' in part ? (part as { text: string }).text : String(part)))
      .join('');
  }
  return content != null ? String(content) : '';
}

async function applyCodeBlocksFromContent(content: string): Promise<{ applied: boolean; displayContent: string }> {
  const codeBlockRe = /```(\w*)\n([\s\S]*?)```/g;
  const appliedBlocks: { start: number; end: number; path: string }[] = [];
  let applied = false;
  let m: RegExpExecArray | null;
  const matches: { fullMatch: string; index: number; lang: string; code: string }[] = [];
  while ((m = codeBlockRe.exec(content)) !== null) {
    matches.push({
      fullMatch: m[0],
      index: m.index,
      lang: m[1] || '',
      code: m[2].replace(/\r\n/g, '\n').trimEnd(),
    });
  }
  for (const { fullMatch, index, lang, code } of matches) {
    if (isRunCommandOnly(lang, code)) continue;
    const beforeBlock = content.substring(0, index);
    // Nome de arquivo: aceita "**hello.py**", "hello.py" antes de espaço/newline/backtick, etc.
    const fileMatch = beforeBlock.match(/(\S+\.(?:py|js|ts|tsx|jsx|html|css|json|md|txt|java|go|rs|c|cpp|rb|php))(?=\s|$|[:.)\]*`"])/gi);
    const rawCandidate = fileMatch ? fileMatch[fileMatch.length - 1].trim() : null;
    const candidate = rawCandidate ? cleanFilename(rawCandidate) : null;
    const path = candidate && CODE_EXT.test(candidate) ? candidate : (lang === 'python' ? 'generated.py' : lang ? `generated.${lang}` : null);
    if (path && code) {
      try {
        console.log(ui.warn(`\n[Fallback] Aplicando código da resposta ao arquivo: ${path}`));
        await executeTool('write_file', JSON.stringify({ path, content: code }));
        applied = true;
        appliedBlocks.push({ start: index, end: index + fullMatch.length, path });
      } catch {
        // ignora falha em um bloco
      }
    }
  }
  // Monta mensagem para exibição: blocos aplicados viram uma linha curta (evita repetir o código)
  let displayContent = content;
  for (let i = appliedBlocks.length - 1; i >= 0; i--) {
    const { start, end, path } = appliedBlocks[i];
    const placeholder = `\n${ui.dim('[Código aplicado ao arquivo: ' + path + ']')}\n`;
    displayContent = displayContent.substring(0, start) + placeholder + displayContent.substring(end);
  }
  return { applied, displayContent };
}

async function createCompletionWithRetry(
  client: InstanceType<typeof OpenAI>,
  modelId: string,
  messages: ChatCompletionMessageParam[],
  toolsList: ChatCompletionTool[]
): Promise<ChatCompletion> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    try {
      return await client.chat.completions.create({
        model: modelId,
        messages,
        tools: toolsList,
        tool_choice: 'auto'
      });
    } catch (err: any) {
      lastError = err;
      const is429 = err?.status === 429 || (err?.message && String(err.message).includes('429'));
      if (is429 && attempt < MAX_429_RETRIES) {
        const delayMs = BASE_429_DELAY_MS * (attempt + 1);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function processLLMResponse(
  client: InstanceType<typeof OpenAI>,
  modelId: string,
  messages: ChatCompletionMessageParam[],
  toolsList: ChatCompletionTool[]
) {
  const spinner = ora('Thinking...').start();

  try {
    let completion = await createCompletionWithRetry(client, modelId, messages, toolsList);

    let message = completion.choices[0].message;
    spinner.stop();

    let writeFileExecutedThisTurn = false;

    while (message.tool_calls && message.tool_calls.length > 0) {
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        const name = toolCall.function.name;
        if (name === 'write_file') writeFileExecutedThisTurn = true;
        const args = toolCall.function.arguments ?? '{}';
        console.log(ui.warn(`\n[Executing Tool: ${name}]`));
        console.log(ui.dim(`Arguments: ${args}`));
        const toolSpinner = ora('Running tool...').start();
        const result = isMcpTool(name)
          ? await callMcpTool(name, args)
          : await executeTool(name, args);
        toolSpinner.stop();
        console.log(ui.dim(`Result: ${result.length} characters`));

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      spinner.start('Thinking...');
      completion = await createCompletionWithRetry(client, modelId, messages, toolsList);
      message = completion.choices[0].message;
      spinner.stop();
    }

    const rawContent = message.content;
    let contentStr = messageContentToString(rawContent);
    let finalContent = rawContent ?? contentStr;

    // Quando a API não executa tools, tentar aplicar blocos de código da resposta
    if (!writeFileExecutedThisTurn) {
      let result = await applyCodeBlocksFromContent(contentStr);
      // Se a IA só disse "We will call read_file/write_file" e não há código, pedir o código em um follow-up
      const looksLikeToolIntentOnly = /(We will call|We need to call|Let's call|I will call)\s+(read_file|write_file|run_command)/i.test(contentStr)
        || (/call\s+(read_file|write_file)/i.test(contentStr) && contentStr.length < 400);
      if (!result.applied && looksLikeToolIntentOnly) {
        messages.push({ role: 'assistant', content: rawContent ?? contentStr });
        const followUpSystem = `This API does not support tool calls. You must NOT reply with "We will call X". Output the complete file content in a markdown code block so the user's CLI can create/edit the file. Format: mention the filename (e.g. hello.py) then newline then \`\`\`python then newline then the FULL file content then \`\`\`. Do that now for the user's last request.`;
        messages.push({ role: 'system', content: followUpSystem });
        spinner.start('Getting code...');
        const followUp = await createCompletionWithRetry(client, modelId, messages, toolsList);
        spinner.stop();
        const followUpMsg = followUp.choices[0].message;
        const followUpStr = messageContentToString(followUpMsg.content);
        if (followUpStr.trim() !== '') {
          result = await applyCodeBlocksFromContent(followUpStr);
          contentStr = followUpStr;
          finalContent = followUpMsg.content ?? followUpStr;
          messages.push({ role: 'assistant', content: finalContent });
        } else {
          messages.push({ role: 'assistant', content: '' });
        }
      }

      if (contentStr.trim() !== '') {
        let contentToShow = result.applied ? result.displayContent : contentStr;
        console.log('\n' + ui.labelPokt());
        console.log(contentToShow);
        if (!messages.some((m) => m.role === 'assistant' && (m as { content?: unknown }).content === finalContent)) {
          messages.push({ role: 'assistant', content: finalContent });
        }
      } else {
        console.log('\n' + ui.labelPokt());
        console.log(ui.dim('(A IA não retornou código utilizável. Tente reformular o pedido.)'));
        messages.push({ role: 'assistant', content: '' });
      }
    } else {
      if (contentStr.trim() !== '') {
        console.log('\n' + ui.labelPokt());
        console.log(contentStr);
        messages.push({ role: 'assistant', content: finalContent });
      } else {
        console.log('\n' + ui.labelPokt());
        console.log(ui.dim('(Sem resposta de texto.)'));
        messages.push({ role: 'assistant', content: '' });
      }
    }
  } catch (error: any) {
    spinner.stop();
    const is429 = error?.status === 429 || (error?.message && String(error.message).includes('429'));
    if (is429) {
      console.log(ui.error('\nLimite de taxa atingido (429). O provedor está recebendo muitas requisições.'));
      console.log(ui.dim('Aguarde alguns segundos e tente novamente.'));
    } else {
      console.log(ui.error(`\nError: ${error?.message ?? error}`));
    }
    messages.pop();
  }
}
