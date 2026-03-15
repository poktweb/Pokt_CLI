import { CommandModule } from 'yargs';
import { config } from '../config.js';
import chalk from 'chalk';
import { startChatLoop } from '../chat/loop.js';

export const chatCommand: CommandModule = {
  command: 'chat',
  describe: 'Start a Vibe Coding chat session',
  handler: async () => {
    const activeModel = config.get('activeModel');
    if (!activeModel) {
      console.log(chalk.red('Error: No active model selected. Use `pokt models use --provider <provider> --id <model_id>`'));
      return;
    }

    if (activeModel.provider === 'openrouter' && !config.get('openrouterToken')) {
      console.log(chalk.red('Error: OpenRouter token not set. Use `pokt config set-openrouter --value <token>`'));
      return;
    }

    if (activeModel.provider === 'gemini' && !config.get('geminiApiKey')) {
      console.log(chalk.red('Error: Gemini API key not set. Use `pokt config set-gemini --value <key>`'));
      return;
    }

    console.log(chalk.blue(`Starting chat session with [${activeModel.provider}] ${activeModel.id}...`));
    console.log(chalk.gray('Type "exit" to quit.'));
    
    await startChatLoop(activeModel);
  }
};
