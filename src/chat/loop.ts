import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { ModelConfig } from '../config.js';
import { getClient } from './client.js';
import { tools, executeTool } from './tools.js';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `You are Pokt CLI, an expert AI software engineer. 
You can help the user by writing code, reading files, and executing shell commands.
Always strive to be concise, accurate, and autonomous. You can use tools to accomplish tasks.
The user is working in: ${process.cwd()}
`;

export async function startChatLoop(modelConfig: ModelConfig) {
  const client = getClient(modelConfig);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT }
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

async function processLLMResponse(
  client: OpenAI, 
  modelId: string, 
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
) {
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
  } catch (error: any) {
    spinner.stop();
    console.log(chalk.red(`\nError: ${error.message}`));
    messages.pop();
  }
}
