import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { getClient } from './client.js';
import { tools, executeTool } from './tools.js';
const SYSTEM_PROMPT = `You are Pokt CLI, an elite AI Software Engineer.
Your goal is to help the user build, fix, and maintain software projects with high quality.

CORE CAPABILITIES:
1.  **Project Understanding**: You can see the whole file structure and read any file.
2.  **Autonomous Coding**: You can create new files, rewrite existing ones, and run terminal commands.
3.  **Problem Solving**: You analyze errors and propose/apply fixes.

GUIDELINES:
- When asked to fix something, first **read** the relevant files to understand the context.
- When creating a project, start by planning the structure, then use \`write_file\` to create files.
- **DO NOT repeat the generated code in your chat response** if you have already used the \`write_file\` tool. Simply state that the file has been updated or created.
- You have full access to the current terminal. You can run \`npm install\`, \`tsc\`, or any other command.
- Be extremely concise in your explanations.
- The current working directory is: ${process.cwd()}

Before your first response, you will be provided with the current project structure.
`;
export async function startChatLoop(modelConfig) {
    const client = await getClient(modelConfig);
    // Get initial file structure to give AI immediate context
    let initialFiles = '';
    try {
        const { executeTool } = await import('./tools.js');
        initialFiles = await executeTool('list_files', JSON.stringify({ path: '.' }));
    }
    catch (e) {
        initialFiles = 'Could not list files.';
    }
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: `Current Project Structure:\n${initialFiles}` }
    ];
    while (true) {
        const response = await prompts({
            type: 'text',
            name: 'input',
            message: chalk.cyan('You:')
        });
        const userInput = response.input;
        if (!userInput || userInput.toLowerCase() === 'exit') {
            console.log(chalk.gray('Goodbye!'));
            break;
        }
        messages.push({ role: 'user', content: userInput });
        await processLLMResponse(client, modelConfig.id, messages);
    }
}
async function processLLMResponse(client, modelId, messages) {
    const spinner = ora('Thinking...').start();
    try {
        let completion = await client.chat.completions.create({
            model: modelId,
            messages: messages,
            tools: tools,
            tool_choice: 'auto'
        });
        let message = completion.choices[0].message;
        spinner.stop();
        while (message.tool_calls && message.tool_calls.length > 0) {
            messages.push(message);
            for (const toolCall of message.tool_calls) {
                console.log(chalk.yellow(`\n[Executing Tool: ${toolCall.function.name}]`));
                console.log(chalk.gray(`Arguments: ${toolCall.function.arguments}`));
                const toolSpinner = ora('Running tool...').start();
                const result = await executeTool(toolCall.function.name, toolCall.function.arguments);
                toolSpinner.stop();
                console.log(chalk.gray(`Result length: ${result.length} characters`));
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: result,
                });
            }
            spinner.start('Thinking...');
            completion = await client.chat.completions.create({
                model: modelId,
                messages: messages,
                tools: tools,
                tool_choice: 'auto'
            });
            message = completion.choices[0].message;
            spinner.stop();
        }
        if (message.content) {
            console.log(chalk.green('\nPokt:'));
            console.log(message.content);
            messages.push({ role: 'assistant', content: message.content });
        }
    }
    catch (error) {
        spinner.stop();
        console.log(chalk.red(`\nError: ${error.message}`));
        messages.pop();
    }
}
