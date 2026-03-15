import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { ui } from '../ui.js';
import { ModelConfig } from '../config.js';
import { config } from '../config.js';
import { getClient } from './client.js';
import { tools, executeTool } from './tools.js';
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

GUIDELINES:
- You will receive the user request first, then the current project structure. Use the project structure to understand the context before creating or editing anything.
- When asked to fix something, first **read** the relevant files to understand the context.
- When creating a project, start by planning the structure, then use \`write_file\` to create files.
- **DO NOT repeat the generated code in your chat response** if you have already used the \`write_file\` tool. Simply state that the file has been updated or created.
- You have full access to the current terminal. You can run \`npm install\`, \`tsc\`, or any other command.
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
  const client = await getClient(modelConfig);

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

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  while (true) {
    console.log('');
    console.log(ui.shortcutsLine('shift+tab to accept edits', '? for shortcuts'));
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

    messages.push({ role: 'user', content: userInput });

    // Primeiro o modelo vê o pedido; depois carregamos a estrutura do projeto para ele entender e então criar/editar
    const isFirstUserMessage = messages.filter(m => m.role === 'user').length === 1;
    if (isFirstUserMessage) {
      const loadSpinner = ora('Carregando estrutura do projeto...').start();
      const projectStructure = await loadProjectStructure();
      loadSpinner.stop();
      messages.push({ role: 'system', content: `Current Project Structure:\n${projectStructure}` });
    }

    await processLLMResponse(client, modelConfig.id, messages, allTools);
  }
  await disconnectAllMcp();
}

const MAX_429_RETRIES = 3;
const BASE_429_DELAY_MS = 5000;

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

    while (message.tool_calls && message.tool_calls.length > 0) {
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        const name = toolCall.function.name;
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

    if (message.content) {
      console.log('\n' + ui.labelPokt());
      console.log(message.content);
      messages.push({ role: 'assistant', content: message.content });
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
