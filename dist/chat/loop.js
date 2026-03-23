import prompts from 'prompts';
import ora from 'ora';
import { ui } from '../ui.js';
import { runProFlow } from '../commands/pro.js';
import { PROVIDER_LABELS, ALL_PROVIDERS } from '../config.js';
import { config } from '../config.js';
import { getClient } from './client.js';
import { tools, executeTool } from './tools.js';
import { saveAuto, loadAuto, listCheckpoints, saveCheckpoint, loadCheckpoint, deleteCheckpoint, exportConversation, getSessionsDir } from './sessions.js';
import { connectMcpServer, getAllMcpToolsOpenAI, callMcpTool, isMcpTool, disconnectAllMcp, } from '../mcp/client.js';
import { getMergedMcpServers } from '../mcp/project-mcp.js';
import { runMcpFromBashMarkdown, stripExecutedStyleMcpBashBlocks, tryAutoMcpForListDatabases, } from './mcp-from-text.js';
import { slimToolsForUpstreamPayload } from './slim-tools.js';
import { emptyUsageAccumulator, mergeCompletionUsage, sendCliUsageTelemetryFireAndForget, } from './telemetry.js';
/** Base do system prompt; a lista de ferramentas MCP é anexada em runtime quando houver servidores. */
const SYSTEM_PROMPT_BASE = `You are Pokt CLI, an elite AI Software Engineer.
Your goal is to help the user build, fix, and maintain software projects with high quality.

CORE CAPABILITIES:
1.  **Project Understanding**: You can see the whole file structure and read any file.
2.  **Autonomous Coding**: You can create new files, rewrite existing ones, and run terminal commands.
3.  **Problem Solving**: You analyze errors and propose/apply fixes.

FUNCTION CALLING (native tools — USE THEM):
- This chat uses OpenAI-style **tool_calls**. You MUST use the provided functions for actions: \`read_file\`, \`search_replace\`, \`write_file\`, \`run_command\`, \`list_files\`, \`delete_file\`, \`delete_directory\`, etc., and any tool whose name starts with \`mcp_\`.
- **Edits vs rewrites**: For modifying existing files, prefer \`search_replace\` (old_string, new_string, path) — targeted, minimal changes. Use \`write_file\` only for new files or full rewrites. Always call \`read_file\` first to get exact content before \`search_replace\`.
- **Avoid** shell lines like \`mcp_Something_tool "..."\` in markdown — the CLI may run them as **fallback** if they match a registered tool, but **native tool_calls are always better** (correct args, one round-trip).
- For databases/APIs exposed via MCP, call the real \`mcp_*\` tools with the correct JSON arguments (e.g. Neon: run SQL via the server's SQL tool, not a invented command name).
- **Neon MCP**: tools like \`get_database_tables\`, \`describe_project\`, \`list_branch_computes\` need \`projectId\`. Call \`list_projects\` first and pass the \`id\` of the target project, or rely on the CLI: if your account has exactly one project, Pokt may inject \`projectId\` automatically. To list logical Postgres databases, prefer \`run_sql\` with \`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1;\`.
- **Neon \`run_sql\` (tool_calls)**: pass **JSON** fields expected by the schema (e.g. \`projectId\`, \`branchId\`, \`sql\`). Do **not** put \`neonctl\`-style flags inside \`sql\` (wrong: \`{"sql":"--project-id ... --sql \\"SELECT 1\\""}\`; right: \`{"projectId":"...","branchId":"...","sql":"SELECT 1"}\`). Use the \`id\` from \`list_projects\` for \`projectId\` — do not invent project ids.
- If a tool call fails, read the error, adjust arguments, and retry or explain what the user must fix in config.

WHEN THE MODEL DOES NOT RETURN tool_calls (rare):
- You may still output the complete file content in a markdown code block so the CLI fallback can apply it. Format: mention the filename (e.g. hello.py) then \`\`\`lang ... \`\`\`.
- Do NOT use this for shell-only or SQL-in-bash blocks meant to be executed — use \`run_command\` or MCP tools instead.

GUIDELINES:
- You will receive the user request first, then the current project structure. Use the project structure to understand the context before creating or editing anything.
- **Session file focus**: User messages may include a \`[Pokt]\` line with the last path used via \`read_file\` / \`write_file\`. If the user asks to modify, migrate, or rewrite "the" script/app without naming a file, call \`read_file\` on that path and then \`write_file\` to the **same** path. Do **not** switch to \`main.py\` or another new name unless the user explicitly asks.
- When asked to fix something, first **read** the relevant files to understand the context.
- When creating a project, start by planning the structure, then use \`write_file\` (tool call) to create each file.
- You have full access to the current terminal via \`run_command\` for \`npm install\`, \`tsc\`, etc. You may also emit **scripts executáveis** (Node, Python, npx, \`psql\`, etc.) via \`run_command\` when MCP não estiver disponível ou o usuário pedir código para rodar localmente.
- **MCP tools**: Tools named \`mcp_<ServerName>_<toolName>\` connect to external services. Prefer them when they match the task.
- **Never** return a completely empty assistant message: always include a short natural-language answer and/or use tool_calls. After tools run, summarize results for the user in Portuguese.
- **Next.js app/pages conflict**: When build fails with "Conflicting app and page file" (pages/index.js vs app/page.tsx), resolve by calling \`delete_directory("app")\` to remove the app folder and keep only pages. Prefer tool_calls over shell blocks. On Windows, \`delete_directory\` is cross-platform and does not require rmdir/cmd.
- **After MCP/SQL succeeds**: give a **short** confirmation plus a **markdown table** (or bullet list) for rows/columns — do **not** repeat bash blocks with mcp_* lines, raw tool JSON, or invented shell commands; the CLI already executed native tool_calls.
- Be extremely concise in your explanations.
- The current working directory is: ${process.cwd()}
`;
function buildSystemPrompt(mcpToolNames) {
    if (mcpToolNames.length === 0)
        return SYSTEM_PROMPT_BASE;
    const list = mcpToolNames.join(', ');
    return `${SYSTEM_PROMPT_BASE}

REGISTERED MCP TOOL NAMES (use only these exact names in tool_calls, never bash):
${list}`;
}
async function loadProjectStructure() {
    try {
        const timeoutMs = 8000;
        return await Promise.race([
            executeTool('list_files', JSON.stringify({ path: '.' })),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
        ]);
    }
    catch {
        try {
            return await executeTool('list_directory', JSON.stringify({ path: '.' }));
        }
        catch {
            return 'Could not list files.';
        }
    }
}
/** Detecta se o usuário está pedindo modificação/migração em projeto existente (como gemini-cli faz). */
function suggestsProjectModification(userInput) {
    const lower = userInput.toLowerCase().trim();
    const modificationKeywords = [
        'mudar', 'alterar', 'mudança', 'alteração', 'migrar', 'migração', 'trocar', 'converter',
        'converta', 'modificar', 'refatorar', 'atualizar', 'substituir', 'troque', 'mude',
        'change', 'migrate', 'convert', 'modify', 'refactor', 'update', 'replace', 'switch',
    ];
    return modificationKeywords.some((kw) => lower.includes(kw));
}
/** Extrai arquivos .py da estrutura do projeto (list_files retorna paths separados por newline). */
function extractPyFilesFromStructure(structure) {
    const lines = structure.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.filter((p) => /\.py$/i.test(p) && !p.includes('node_modules') && !p.includes('.git'));
}
/** Infere o arquivo alvo para edição quando usuário pede modificar "calculadora", "app", etc. */
function inferTargetFileFromProject(projectStructure, userInput) {
    const pyFiles = extractPyFilesFromStructure(projectStructure);
    if (pyFiles.length === 0)
        return null;
    const lower = userInput.toLowerCase();
    // Palavras-chave que podem indicar o nome do arquivo
    const keywords = ['calculadora', 'calculator', 'app', 'aplicativo', 'script', 'arquivo', 'projeto'];
    for (const kw of keywords) {
        if (lower.includes(kw)) {
            const stem = kw.replace(/a$/, ''); // calculadora -> calculador
            const match = pyFiles.find((f) => {
                const base = f.replace(/\\/g, '/').split('/').pop()?.replace(/\.py$/, '') ?? '';
                return base.toLowerCase().includes(kw) || base.toLowerCase().includes(stem);
            });
            if (match)
                return match;
        }
    }
    // Se só tem um .py no projeto, é provavelmente o alvo
    if (pyFiles.length === 1)
        return pyFiles[0];
    return null;
}
export async function startChatLoop(modelConfig) {
    let activeModel = modelConfig;
    let client = await getClient(activeModel);
    // MCP: config global + pokt_cli/mcp.json na raiz do projeto (projeto sobrescreve por nome)
    const { merged: mcpServers, poktDir, mcpJsonPath } = getMergedMcpServers(process.cwd());
    if (poktDir) {
        console.log(ui.dim(`[MCP] Projeto: ${mcpJsonPath ?? poktDir}`));
    }
    for (const server of mcpServers) {
        const session = await connectMcpServer(server);
        if (session) {
            console.log(ui.dim(`[MCP] Connected: ${session.serverName} (${session.tools.length} tools)`));
        }
    }
    const allTools = [
        ...tools,
        ...getAllMcpToolsOpenAI(),
    ];
    /** Controller (Express) usa body parser com limite finito; MCPs como Neon geram schemas enormes. */
    const toolsForApi = activeModel.provider === 'controller' ? slimToolsForUpstreamPayload(allTools) : allTools;
    const mcpToolNames = allTools
        .filter((t) => t.type === 'function' && Boolean(t.function?.name?.startsWith('mcp_')))
        .map((t) => t.function.name);
    const messages = [{ role: 'system', content: buildSystemPrompt(mcpToolNames) }];
    // Auto-resume do projeto (estilo gemini): se existir, adiciona mensagens anteriores (sem duplicar system prompt)
    const prev = loadAuto();
    if (prev && prev.length > 0) {
        for (const m of prev) {
            if (m.role === 'system')
                continue;
            messages.push({ role: m.role, content: m.content });
        }
        console.log(ui.dim(`Sessão anterior carregada (projeto). Use /chat list | /chat save <tag>.`));
    }
    function modelLabel(m) {
        const provider = PROVIDER_LABELS[m.provider] ?? m.provider;
        return `[${provider}] ${m.id}`;
    }
    async function switchModelFlow(mode = 'model') {
        const models = config.get('registeredModels') ?? [];
        if (!Array.isArray(models) || models.length === 0) {
            console.log(ui.error('Nenhum modelo registrado. Rode: pokt models list'));
            return;
        }
        const providerChoices = ALL_PROVIDERS.map((p) => {
            const label = PROVIDER_LABELS[p] ?? p;
            const hasAny = models.some((m) => m.provider === p);
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
        if (!providerPick.provider || providerPick.provider === 'cancel')
            return;
        const provider = providerPick.provider;
        const providerModels = models.filter((m) => m.provider === provider);
        if (providerModels.length === 0) {
            console.log(ui.error(`Sem modelos para ${PROVIDER_LABELS[provider] ?? provider}.`));
            return;
        }
        let selected = null;
        if (mode === 'provider') {
            selected = providerModels[0];
        }
        else {
            const pick = await prompts({
                type: 'select',
                name: 'idx',
                message: `Modelos em ${PROVIDER_LABELS[provider] ?? provider}:`,
                choices: [
                    ...providerModels.map((m, i) => ({
                        title: `${activeModel.provider === m.provider && activeModel.id === m.id ? '★ ' : ''}${m.id}`,
                        value: i,
                    })),
                    { title: '🔙 Cancelar', value: 'cancel' },
                ],
            });
            if (pick.idx === 'cancel' || typeof pick.idx !== 'number')
                return;
            selected = providerModels[pick.idx] ?? null;
        }
        if (!selected)
            return;
        // Validar chaves/credenciais necessárias (reaproveita mesma lógica do providerCommand / getClient)
        try {
            const newClient = await getClient(selected);
            client = newClient;
        }
        catch (e) {
            console.log(ui.error(e?.message ?? String(e)));
            return;
        }
        activeModel = selected;
        config.set('activeModel', selected);
        console.log(ui.success(`Modelo ativo atualizado: ${modelLabel(selected)}`));
        console.log(ui.dim('Dica: o histórico do chat foi mantido; apenas o modelo/provedor mudou.'));
    }
    function printHelp() {
        console.log(ui.dim(`
Comandos do chat:
  ${ui.accent('/help')} — mostra esta ajuda
  ${ui.accent('/clear')} — limpa a tela
  ${ui.accent('/status')} — mostra modelo/provider atual
  ${ui.accent('/model')} — trocar modelo (menu interativo)
  ${ui.accent('/provider')} — trocar provedor (usa o 1º modelo disponível)
  ${ui.accent('/chat')} — checkpoints/sessões (list/save/resume/delete/share)
  ${ui.accent('/resume')} — alias de /chat
  ${ui.accent('/copy')} — copia a última resposta do Pokt (Windows: clip)
  ${ui.accent('/pro')} — abrir compra de token no navegador (Vercel)
  ${ui.accent('/quit')} ou ${ui.accent('exit')} — sair do chat
`));
    }
    let lastAssistantText = '';
    /** Último caminho relativo usado em read_file/write_file pelas tool_calls do assistente (foco da sessão). */
    const sessionFileCtx = {
        lastFocusedRelativePath: null,
        suggestedModificationTarget: null,
    };
    async function handleChatCommand(raw) {
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
                if (m.role === 'system')
                    continue;
                messages.push({ role: m.role, content: m.content });
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
                await executeTool('run_command', JSON.stringify({ command: `powershell -NoProfile -Command "Get-Content -Raw '${tmp}' | clip"` }));
                // best-effort cleanup
                try {
                    await executeTool('delete_file', JSON.stringify({ path: tmp }));
                }
                catch {
                    // ignore
                }
                console.log(ui.success('Copiado para a área de transferência.'));
            }
            catch {
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
            console.log(ui.dim(`
Atalhos:
  ${ui.accent('/pro')} ou ${ui.accent('/torne-se-pro')} — comprar token (abre Vercel; painel/API na Railway)
  exit, ${ui.accent('/quit')} — sair do chat
  ${ui.accent('/help')} — ver comandos do chat
`));
            continue;
        }
        let userContent = userInput;
        if (sessionFileCtx.lastFocusedRelativePath) {
            userContent = `${userInput}\n\n[Pokt] Último arquivo usado com read_file/write_file/search_replace nesta sessão: \`${sessionFileCtx.lastFocusedRelativePath}\`. Para alterar esse trabalho sem o usuário citar o nome, leia esse caminho e edite com search_replace ou write_file no mesmo caminho — não crie outro arquivo (ex.: main.py) por padrão.]`;
        }
        messages.push({ role: 'user', content: userContent });
        saveAuto(messages);
        // Injeta estrutura do projeto para o modelo entender o contexto (como gemini-cli verifica antes de editar)
        // Sempre na 1ª mensagem; também quando pedido sugere modificação/migração em projeto existente
        const isFirstUserMessage = messages.filter(m => m.role === 'user').length === 1;
        const needsProjectContext = isFirstUserMessage || suggestsProjectModification(userInput);
        if (needsProjectContext) {
            const loadSpinner = ora('Verificando estrutura do projeto...').start();
            const projectStructure = await loadProjectStructure();
            loadSpinner.stop();
            const targetFile = suggestsProjectModification(userInput)
                ? inferTargetFileFromProject(projectStructure, userInput)
                : null;
            if (targetFile) {
                sessionFileCtx.suggestedModificationTarget = targetFile;
            }
            let structureHint = '[Pokt] Use list_files/read_file para confirmar arquivos existentes. Para modificar: leia com read_file, edite com search_replace ou write_file no MESMO caminho — NÃO crie main.py ou novo projeto.';
            if (targetFile) {
                structureHint += ` OBRIGATÓRIO: o arquivo a editar é \`${targetFile}\`. Use tool_calls em \`${targetFile}\`, NUNCA em main.py.`;
            }
            messages.push({
                role: 'system',
                content: `Current Project Structure:\n${projectStructure}\n\n${structureHint}`,
            });
        }
        await processLLMResponse(client, activeModel, messages, toolsForApi, sessionFileCtx);
        // Atualiza auto-save após resposta
        saveAuto(messages);
        // Captura última resposta do assistente para /copy (melhor esforço)
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m?.role === 'assistant') {
                const c = m.content;
                lastAssistantText = typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p && p.text ? p.text : String(p))).join('') : String(c ?? '');
                break;
            }
        }
    }
    await disconnectAllMcp();
}
const MAX_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 1500;
const MAX_RETRY_DELAY_MS = 15000;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function getStatusCode(err) {
    const s = err?.status ?? err?.response?.status;
    return typeof s === 'number' ? s : null;
}
function isRetryable(err) {
    const status = getStatusCode(err);
    if (status === 429 || status === 408)
        return true;
    if (status && status >= 500 && status <= 599)
        return true;
    const msg = String(err?.message ?? '');
    // erros comuns de rede/timeout
    return /(ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|fetch failed|network|timeout)/i.test(msg);
}
function computeBackoff(attempt) {
    const exp = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
    const jitter = Math.floor(Math.random() * 250);
    return exp + jitter;
}
/** Extensões que consideramos como arquivos de código para aplicar fallback */
const CODE_EXT = /\.(py|js|ts|tsx|jsx|html|css|json|md|txt|java|go|rs|c|cpp|rb|php)$/i;
/** Blocos shell/console: nunca viram arquivo no fallback (evita SQL/comandos fictícios em mcp.json). */
function isShellLikeBlock(lang) {
    return /^(bash|sh|shell|zsh|powershell|ps1|cmd|console)$/i.test(lang);
}
/** Comandos que resolvem conflito Next.js app/pages - executar via run_command quando em blocos shell. */
function looksLikeNextJsConflictFix(code) {
    const t = code.trim().toLowerCase();
    if (/mcp_[a-z0-9_-]+/i.test(t))
        return false; // MCP já tratado separadamente
    return ((/\brmdir\b.*\bapp\b/.test(t) || /\bremove-item\b.*\bapp\b/i.test(t) || /\brm\s+-rf?\s+app\b/.test(t)) ||
        (/\brmdir\b.*\.next\b/.test(t) || /\bremove-item\b.*\.next\b/i.test(t) || /\brm\s+-rf?\s+\.next\b/.test(t)));
}
/**
 * Executa blocos shell (cmd, powershell) que parecem corrigir conflito Next.js.
 * Fallback quando a IA coloca rmdir/Remove-Item em markdown em vez de usar delete_directory.
 */
async function executeShellBlocksFromContent(content) {
    const codeBlockRe = /```(cmd|powershell|ps1|bash|sh)\s*\n([\s\S]*?)```/gi;
    const executedBlocks = [];
    let executed = false;
    let m;
    const isWin = process.platform === 'win32';
    while ((m = codeBlockRe.exec(content)) !== null) {
        const lang = (m[1] || '').toLowerCase();
        const code = (m[2] || '').replace(/\r\n/g, '\n').trim();
        if (!code || !looksLikeNextJsConflictFix(code))
            continue;
        const lines = code.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0)
            continue;
        for (const line of lines) {
            if (/mcp_[a-z0-9_-]+/i.test(line))
                continue;
            const cmd = isWin && /^(bash|sh)$/.test(lang)
                ? `cmd /c ${line.replace(/rm\s+-rf?\s+(\S+)/g, 'rmdir /s /q $1')}`
                : line;
            try {
                if (toolsVerbose())
                    console.log(ui.warn(`\n[Fallback] Executando: ${cmd}`));
                else
                    console.log(ui.dim(`\n[Fallback] Executando comando: ${cmd.slice(0, 60)}${cmd.length > 60 ? '…' : ''}`));
                await executeTool('run_command', JSON.stringify({ command: cmd }));
                executed = true;
                executedBlocks.push({ start: m.index, end: m.index + m[0].length, command: cmd });
                break;
            }
            catch {
                // ignora falha
            }
        }
    }
    let displayContent = content;
    for (let i = executedBlocks.length - 1; i >= 0; i--) {
        const { start, end, command } = executedBlocks[i];
        const placeholder = `\n${ui.dim('[Comando executado: ' + command.slice(0, 50) + (command.length > 50 ? '…' : '') + ']')}\n`;
        displayContent = displayContent.substring(0, start) + placeholder + displayContent.substring(end);
    }
    return { executed, displayContent };
}
/**
 * Caminhos que o fallback nunca deve sobrescrever (config MCP, env, lockfile).
 */
const FALLBACK_PATH_BLOCKLIST = /(^|\/|\\)(mcp\.json|\.env(\.[a-zA-Z0-9_-]+)?|package-lock\.json)$/i;
function isFallbackPathBlocked(relPath) {
    const norm = relPath.replace(/\\/g, '/');
    const base = norm.split('/').pop() ?? norm;
    return FALLBACK_PATH_BLOCKLIST.test(norm) || FALLBACK_PATH_BLOCKLIST.test(base);
}
/** Evita gravar `generated.*` com JSON de resposta MCP/SQL (eco do modelo). */
function looksLikeMcpOrSqlResultSnippet(code) {
    const t = code.trim();
    if (!t)
        return false;
    if (/MCP error|"invalid_type"|Input validation error/i.test(t))
        return true;
    try {
        const j = JSON.parse(t);
        if (j !== null && typeof j === 'object' && !Array.isArray(j)) {
            const o = j;
            if ('success' in o && 'result' in o)
                return true;
            if (typeof o.error === 'string' && /mcp|tool|validation|invalid/i.test(o.error))
                return true;
        }
        if (Array.isArray(j) && j.length > 0 && j.length <= 200) {
            const first = j[0];
            if (first && typeof first === 'object' && !Array.isArray(first)) {
                const row = first;
                const keys = Object.keys(row);
                if (keys.length === 0)
                    return false;
                if (!keys.every((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)))
                    return false;
                const vals = Object.values(row);
                if (vals.every((v) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
                    return true;
                }
            }
        }
    }
    catch {
        // não é JSON — não marcar
    }
    return false;
}
function toolsVerbose() {
    return process.env.POKT_VERBOSE_TOOLS === '1' || process.env.POKT_VERBOSE === '1';
}
/** Linhas estilo "mcp_Server_tool ..." não são arquivos — são invocações inventadas. */
function looksLikeFakeMcpInvocation(code) {
    return /^\s*mcp_[A-Za-z0-9_.-]+\s+/m.test(code.trim());
}
/**
 * Quando a API não retorna tool_calls, alguns backends só devolvem texto.
 * Extrai blocos de código da resposta (```lang\n...\n```) e, se encontrar
 * um nome de arquivo mencionado antes do bloco, aplica write_file.
 */
/** Remove markdown/formatting do nome de arquivo (ex: **hello.py** → hello.py, (main.py → main.py). */
function cleanFilename(candidate) {
    return candidate
        .replace(/^[\s*`'"(\[]+/g, '')
        .replace(/[\s*`'")\]\s]+$/g, '')
        .trim();
}
/**
 * Aplica blocos de código da resposta e retorna conteúdo para exibição (sem repetir o código).
 * - Detecta nome de arquivo na mensagem (ex: "updated **hello.py**") para editar o existente.
 * - Blocos já aplicados são substituídos por "[Código aplicado ao arquivo: path]" na mensagem exibida.
 */
/** Garante que o conteúdo da mensagem seja string (algumas APIs devolvem array). */
function messageContentToString(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content
            .map((part) => (typeof part === 'object' && part != null && 'text' in part ? part.text : String(part)))
            .join('');
    }
    return content != null ? String(content) : '';
}
function getFirstChoiceMessage(completion) {
    const msg = completion.choices?.[0]?.message;
    return msg ?? null;
}
function trackToolPathFocus(name, argsStr, ctx) {
    if (name !== 'read_file' && name !== 'write_file' && name !== 'search_replace')
        return;
    try {
        const args = JSON.parse(argsStr);
        if (typeof args.path === 'string' && args.path.trim()) {
            ctx.lastFocusedRelativePath = args.path.replace(/\\/g, '/').trim();
        }
    }
    catch {
        /* ignore */
    }
}
/**
 * Se o fallback iria gravar em generated.* mas já há um arquivo “foco” na sessão com a mesma extensão,
 * reutiliza esse caminho (evita criar generated.py ao lado de calculadora.py).
 */
function preferSessionPathOverGenerated(resolvedPath, ctx) {
    const sessionLast = ctx?.lastFocusedRelativePath ?? null;
    const suggested = ctx?.suggestedModificationTarget ?? null;
    // Quando usuário pediu modificar e há arquivo inferido, NUNCA criar main.py/generated.py
    if (suggested && /^(main|generated)\./i.test(resolvedPath)) {
        return suggested.replace(/\\/g, '/');
    }
    if (!sessionLast || !/^generated\./i.test(resolvedPath))
        return resolvedPath;
    const suffix = resolvedPath.slice(resolvedPath.indexOf('.') + 1).toLowerCase();
    const normLast = sessionLast.replace(/\\/g, '/').toLowerCase();
    const extensionsForSuffix = {
        py: ['.py'],
        python: ['.py'],
        js: ['.js'],
        javascript: ['.js'],
        mjs: ['.mjs'],
        cjs: ['.cjs'],
        ts: ['.ts', '.tsx'],
        typescript: ['.ts', '.tsx'],
        tsx: ['.tsx'],
        jsx: ['.jsx'],
        java: ['.java'],
        go: ['.go'],
        rs: ['.rs'],
        html: ['.html', '.htm'],
        css: ['.css'],
        json: ['.json'],
        md: ['.md', '.markdown'],
        txt: ['.txt'],
        cpp: ['.cpp', '.cc', '.cxx'],
        c: ['.c'],
        rb: ['.rb'],
        php: ['.php'],
    };
    const exts = extensionsForSuffix[suffix];
    if (exts?.some((e) => normLast.endsWith(e)))
        return sessionLast.replace(/\\/g, '/');
    if (normLast.endsWith('.' + suffix))
        return sessionLast.replace(/\\/g, '/');
    return resolvedPath;
}
async function applyCodeBlocksFromContent(content, sessionFileCtx) {
    const codeBlockRe = /```(\w*)\n([\s\S]*?)```/g;
    const appliedBlocks = [];
    let applied = false;
    let m;
    const matches = [];
    while ((m = codeBlockRe.exec(content)) !== null) {
        matches.push({
            fullMatch: m[0],
            index: m.index,
            lang: m[1] || '',
            code: m[2].replace(/\r\n/g, '\n').trimEnd(),
        });
    }
    for (const { fullMatch, index, lang, code } of matches) {
        if (isShellLikeBlock(lang))
            continue;
        if (looksLikeFakeMcpInvocation(code))
            continue;
        const beforeBlock = content.substring(0, index);
        // Nome de arquivo: aceita "**hello.py**", "hello.py" antes de espaço/newline/backtick, etc.
        const fileMatch = beforeBlock.match(/(\S+\.(?:py|js|ts|tsx|jsx|html|css|json|md|txt|java|go|rs|c|cpp|rb|php))(?=\s|$|[:.)\]*`"])/gi);
        const rawCandidate = fileMatch ? fileMatch[fileMatch.length - 1].trim() : null;
        const candidate = rawCandidate ? cleanFilename(rawCandidate) : null;
        let path = candidate && CODE_EXT.test(candidate) ? candidate : lang === 'python' ? 'generated.py' : lang ? `generated.${lang}` : null;
        if (path) {
            path = preferSessionPathOverGenerated(path, sessionFileCtx);
        }
        if (path && isFallbackPathBlocked(path))
            continue;
        if (path &&
            /^generated\./i.test(path) &&
            looksLikeMcpOrSqlResultSnippet(code)) {
            continue;
        }
        if (path && code) {
            try {
                if (toolsVerbose()) {
                    console.log(ui.warn(`\n[Fallback] Aplicando código da resposta ao arquivo: ${path}`));
                }
                else {
                    console.log(ui.dim(`\n[Fallback] ${path}`));
                }
                await executeTool('write_file', JSON.stringify({ path, content: code }));
                applied = true;
                if (sessionFileCtx)
                    sessionFileCtx.lastFocusedRelativePath = path.replace(/\\/g, '/');
                appliedBlocks.push({ start: index, end: index + fullMatch.length, path });
            }
            catch {
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
async function createCompletionWithRetry(client, modelId, messages, toolsList, toolChoice = 'auto', usageAcc) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const out = await client.chat.completions.create({
                model: modelId,
                messages,
                tools: toolsList,
                tool_choice: toolChoice,
            });
            if (usageAcc)
                mergeCompletionUsage(usageAcc, out);
            return out;
        }
        catch (err) {
            lastError = err;
            const retryable = isRetryable(err);
            if (retryable && attempt < MAX_RETRIES) {
                const delayMs = computeBackoff(attempt);
                await sleep(delayMs);
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}
/**
 * Executa todas as rodadas de tool_calls até o modelo devolver mensagem sem ferramentas.
 */
async function drainToolCalls(client, modelId, messages, toolsList, startMessage, spinner, sessionFileCtx, usageAcc) {
    let message = startMessage;
    let writeFileExecuted = false;
    let anyToolExecuted = false;
    let mcpToolExecuted = false;
    const verbose = toolsVerbose();
    while (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);
        for (const toolCall of message.tool_calls) {
            anyToolExecuted = true;
            const name = toolCall.function.name;
            if (name === 'write_file' || name === 'search_replace')
                writeFileExecuted = true;
            if (isMcpTool(name))
                mcpToolExecuted = true;
            const args = toolCall.function.arguments ?? '{}';
            trackToolPathFocus(name, args, sessionFileCtx);
            const isMcp = isMcpTool(name);
            if (isMcp && !verbose) {
                console.log(ui.dim(`[MCP] ${name}…`));
            }
            else {
                console.log(ui.warn(`\n[Executing Tool: ${name}]`));
                if (verbose || !isMcp)
                    console.log(ui.dim(`Arguments: ${args}`));
            }
            const toolSpinner = ora('Running tool...').start();
            const result = isMcp ? await callMcpTool(name, args) : await executeTool(name, args);
            toolSpinner.stop();
            if (verbose) {
                console.log(ui.dim(`Result: ${result.length} characters`));
            }
            else if (isMcp) {
                console.log(ui.dim(`[MCP] ${name} ✓ (${result.length} chars)`));
            }
            else {
                console.log(ui.dim(`Result: ${result.length} characters`));
            }
            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: result,
            });
        }
        spinner.start('Thinking...');
        const completion = await createCompletionWithRetry(client, modelId, messages, toolsList, 'auto', usageAcc);
        spinner.stop();
        const nextMsg = getFirstChoiceMessage(completion);
        if (!nextMsg) {
            throw new Error('Resposta da API sem choices após execução de ferramentas.');
        }
        message = nextMsg;
    }
    return { message, writeFileExecuted, anyToolExecuted, mcpToolExecuted };
}
function emitCliTelemetryForTurn(modelConfig, acc) {
    const total = acc.prompt + acc.completion;
    if (total <= 0)
        return;
    sendCliUsageTelemetryFireAndForget({
        provider: modelConfig.provider,
        model: modelConfig.id,
        promptTokens: acc.prompt,
        completionTokens: acc.completion,
        totalTokens: total,
        cost: acc.cost,
    });
}
async function processLLMResponse(client, modelConfig, messages, toolsList, sessionFileCtx) {
    const spinner = ora('Thinking...').start();
    const modelId = modelConfig.id;
    const usageAcc = emptyUsageAccumulator();
    try {
        let completion = await createCompletionWithRetry(client, modelId, messages, toolsList, 'auto', usageAcc);
        const first = getFirstChoiceMessage(completion);
        if (!first) {
            spinner.stop();
            console.log(ui.error('\nResposta da API sem choices/mensagem. Tente novamente ou outro modelo.'));
            messages.pop();
            emitCliTelemetryForTurn(modelConfig, usageAcc);
            return;
        }
        let message = first;
        spinner.stop();
        const drained = await drainToolCalls(client, modelId, messages, toolsList, message, spinner, sessionFileCtx, usageAcc);
        message = drained.message;
        let writeFileExecutedThisTurn = drained.writeFileExecuted;
        let anyToolExecutedThisTurn = drained.anyToolExecuted;
        let mcpToolExecutedThisTurn = drained.mcpToolExecuted;
        let rawContent = message.content;
        let contentStr = messageContentToString(rawContent);
        let finalContent = rawContent ?? contentStr;
        if (mcpToolExecutedThisTurn) {
            contentStr = stripExecutedStyleMcpBashBlocks(contentStr);
            finalContent = contentStr;
        }
        // Modelo devolveu só tool_calls e texto vazio — evita mensagem inútil
        if (!contentStr.trim() && anyToolExecutedThisTurn) {
            contentStr =
                '*(Ferramentas foram executadas (veja os logs `[MCP]` acima). O modelo não gerou texto final — peça um resumo com tabelas/dados se precisar.)*';
            finalContent = contentStr;
        }
        // Só executa fallback bash se não houve MCP nativo (evita SQL duplicado e ruído).
        let mcpFromText = mcpToolExecutedThisTurn
            ? { invocationCount: 0, executedCount: 0, augmentedAssistantText: contentStr }
            : await runMcpFromBashMarkdown(contentStr, {
                skipDuplicateAppendix: /\n##\s+Resultados\s+MCP\b/i.test(contentStr),
            });
        if (mcpFromText.invocationCount > 0) {
            contentStr = mcpFromText.augmentedAssistantText;
            finalContent = mcpFromText.augmentedAssistantText;
        }
        // Resposta completamente vazia: recuperação (tool_choice required)
        if (!contentStr.trim() && toolsList.length > 0) {
            const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
            const lastUserContent = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
            const isModificationRequest = suggestsProjectModification(lastUserContent);
            let recoveryHint = '[Pokt — recuperação] A última resposta veio vazia. Responda em português. Use tool_calls. Nunca devolva corpo vazio. ';
            if (isModificationRequest) {
                recoveryHint +=
                    'O usuário pediu modificação em projeto existente: chame list_files para ver arquivos, read_file no arquivo relevante, depois search_replace ou write_file no MESMO caminho. NÃO crie projeto novo. Para conflito Next.js app/pages: delete_directory("app"). ';
            }
            recoveryHint +=
                'Para bancos PostgreSQL: mcp_*_run_sql com {"sql":"SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1;"}. ' +
                    'Alternativa: run_command com script (node, python, npx, psql).';
            messages.push({ role: 'system', content: recoveryHint });
            spinner.start('Recuperando resposta vazia…');
            let recovery;
            try {
                recovery = await createCompletionWithRetry(client, modelId, messages, toolsList, 'required', usageAcc);
            }
            catch {
                recovery = await createCompletionWithRetry(client, modelId, messages, toolsList, 'auto', usageAcc);
            }
            spinner.stop();
            const recoveryFirst = getFirstChoiceMessage(recovery);
            if (!recoveryFirst) {
                console.log(ui.error('\nResposta da API sem choices na recuperação. Tente outro modelo.'));
                messages.pop();
                emitCliTelemetryForTurn(modelConfig, usageAcc);
                return;
            }
            const drained2 = await drainToolCalls(client, modelId, messages, toolsList, recoveryFirst, spinner, sessionFileCtx, usageAcc);
            message = drained2.message;
            writeFileExecutedThisTurn = writeFileExecutedThisTurn || drained2.writeFileExecuted;
            anyToolExecutedThisTurn = anyToolExecutedThisTurn || drained2.anyToolExecuted;
            mcpToolExecutedThisTurn = mcpToolExecutedThisTurn || drained2.mcpToolExecuted;
            rawContent = message.content;
            contentStr = messageContentToString(rawContent);
            finalContent = rawContent ?? contentStr;
            if (mcpToolExecutedThisTurn) {
                contentStr = stripExecutedStyleMcpBashBlocks(contentStr);
                finalContent = contentStr;
            }
            if (!contentStr.trim() && anyToolExecutedThisTurn) {
                contentStr =
                    '*(Ferramentas executadas no terminal acima; o modelo ainda não resumiu em texto — diga “resuma” se quiser.)*';
                finalContent = contentStr;
            }
            mcpFromText = mcpToolExecutedThisTurn
                ? { invocationCount: 0, executedCount: 0, augmentedAssistantText: contentStr }
                : await runMcpFromBashMarkdown(contentStr, {
                    skipDuplicateAppendix: /\n##\s+Resultados\s+MCP\b/i.test(contentStr),
                });
            if (mcpFromText.invocationCount > 0) {
                contentStr = mcpFromText.augmentedAssistantText;
                finalContent = mcpFromText.augmentedAssistantText;
            }
        }
        if (!contentStr.trim()) {
            const autoDb = await tryAutoMcpForListDatabases(messages);
            if (autoDb) {
                contentStr = autoDb;
                finalContent = autoDb;
            }
        }
        // Executar blocos shell que resolvem conflito Next.js (rmdir app, etc.)
        const shellResult = await executeShellBlocksFromContent(contentStr);
        if (shellResult.executed)
            contentStr = shellResult.displayContent;
        // Quando a API não executa tools, tentar aplicar blocos de código da resposta
        if (!writeFileExecutedThisTurn) {
            let result = await applyCodeBlocksFromContent(contentStr, sessionFileCtx);
            // Se a IA só disse "We will call read_file/write_file" e não há código, pedir o código em um follow-up
            const looksLikeToolIntentOnly = /(We will call|We need to call|Let's call|I will call)\s+(read_file|search_replace|write_file|run_command)/i.test(contentStr)
                || (/call\s+(read_file|search_replace|write_file)/i.test(contentStr) && contentStr.length < 400);
            if (!result.applied && looksLikeToolIntentOnly) {
                messages.push({ role: 'assistant', content: rawContent ?? contentStr });
                const followUpSystem = `You replied as if tools would run in text only. Use tool_calls for read_file/search_replace/write_file/run_command/delete_directory/delete_file/mcp_* when possible. Prefer search_replace for edits. For Next.js app/pages conflict: call delete_directory("app"). If you must output a file as markdown only: mention the filename then a full \`\`\`lang\`\`\` block — never use fake shell lines like mcp_Foo_bar. Do that now for the user's last request.`;
                messages.push({ role: 'system', content: followUpSystem });
                spinner.start('Getting code...');
                const followUp = await createCompletionWithRetry(client, modelId, messages, toolsList, 'auto', usageAcc);
                spinner.stop();
                const followUpMsg = getFirstChoiceMessage(followUp);
                if (!followUpMsg) {
                    console.log(ui.error('\nFollow-up da API sem choices/mensagem.'));
                    messages.push({ role: 'assistant', content: '' });
                }
                else {
                    const followUpStr = messageContentToString(followUpMsg.content);
                    if (followUpStr.trim() !== '') {
                        result = await applyCodeBlocksFromContent(followUpStr, sessionFileCtx);
                        contentStr = followUpStr;
                        finalContent = followUpMsg.content ?? followUpStr;
                        messages.push({ role: 'assistant', content: finalContent });
                    }
                    else {
                        messages.push({ role: 'assistant', content: '' });
                    }
                }
            }
            if (contentStr.trim() !== '') {
                let contentToShow = result.applied ? result.displayContent : contentStr;
                console.log('\n' + ui.labelPokt());
                console.log(contentToShow);
                if (!messages.some((m) => m.role === 'assistant' && m.content === finalContent)) {
                    messages.push({ role: 'assistant', content: finalContent });
                }
            }
            else {
                console.log('\n' + ui.labelPokt());
                const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                const lastContent = typeof lastUser?.content === 'string' ? lastUser.content : '';
                const isMod = suggestsProjectModification(lastContent);
                const hint = isMod
                    ? '(Sem resposta da IA. Para modificar projeto: peça "liste os arquivos e leia o arquivo". Tente /model.)'
                    : '(Sem resposta da IA após recuperação. Tente: /model, ou peça mcp_Neon_run_sql, ou run_command.)';
                console.log(ui.dim(hint));
                messages.push({ role: 'assistant', content: '' });
            }
        }
        else {
            if (contentStr.trim() !== '') {
                console.log('\n' + ui.labelPokt());
                console.log(contentStr);
                messages.push({ role: 'assistant', content: finalContent });
            }
            else {
                console.log('\n' + ui.labelPokt());
                console.log(ui.dim('(Sem resposta de texto.)'));
                messages.push({ role: 'assistant', content: '' });
            }
        }
        emitCliTelemetryForTurn(modelConfig, usageAcc);
    }
    catch (error) {
        spinner.stop();
        emitCliTelemetryForTurn(modelConfig, usageAcc);
        const status = getStatusCode(error);
        if (status === 429) {
            console.log(ui.error('\nLimite de taxa (429). O provedor está te limitando por volume ou quota.'));
            console.log(ui.dim('Dica: aguarde um pouco e tente novamente; se persistir, troque o provider/model ou verifique sua quota.'));
        }
        else if (status === 401 || status === 403) {
            console.log(ui.error(`\nNão autorizado (${status}). Sua chave/token pode estar inválida ou sem permissão.`));
            console.log(ui.dim('Dica: rode "pokt doctor" e confira suas variáveis de ambiente / pokt config show.'));
        }
        else if (status && status >= 500 && status <= 599) {
            console.log(ui.error(`\nFalha no servidor (${status}). O provedor está instável no momento.`));
            console.log(ui.dim('Dica: tente novamente em alguns segundos ou troque de provider.'));
        }
        else if (status === 413 || /413|Payload Too Large/i.test(String(error?.message ?? ''))) {
            console.log(ui.error('\nCorpo da requisição muito grande (413 Payload Too Large).'));
            console.log(ui.dim('Dica: use /chat save e /clear ou comece sessão nova; histórico + ferramentas MCP (Neon) estouram o limite do servidor. O Pokt já reduz schemas ao usar o Controller — atualize o Controller (limite JSON) e o CLI.'));
        }
        else {
            console.log(ui.error(`\nError: ${error?.message ?? error}`));
        }
        messages.pop();
    }
}
