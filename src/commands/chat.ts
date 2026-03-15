import type * as Yargs from 'yargs';
import { config, getEffectiveActiveModel } from '../config.js';
import chalk from 'chalk';
import { startChatLoop } from '../chat/loop.js';
import { ui } from '../ui.js';

export const chatCommand: Yargs.CommandModule = {
  command: 'chat',
  describe: 'Start a Vibe Coding chat session',
  handler: async (argv: unknown) => {
    const fromMenu = (argv as { fromMenu?: boolean })?.fromMenu;
    const activeModel = getEffectiveActiveModel();
    if (!activeModel) {
      console.log(ui.error('No active model selected. Run: pokt models list then pokt models use -p <provider> -i <id>'));
      return;
    }

    if (activeModel.provider === 'openrouter' && !config.get('openrouterToken')) {
      console.log(ui.error('OpenRouter token not set. Use: pokt config set-openrouter -v <token>'));
      return;
    }

    if (activeModel.provider === 'gemini' && !config.get('geminiApiKey')) {
      console.log(ui.error('Gemini API key not set. Use: pokt config set-gemini -v <key>'));
      return;
    }

    if (activeModel.provider === 'controller') {
      if (!config.get('poktToken')) {
        console.log(ui.error('Pokt token not set. Generate one at the panel and: pokt config set-pokt-token -v <token>'));
        return;
      }
    }

    // Se veio do menu interativo, não repetir banner/tips (já foram exibidos)
    if (!fromMenu) {
      console.log(ui.banner());
      console.log(ui.statusLine(`[${activeModel.provider}] ${activeModel.id}`));
      console.log('');
      console.log(ui.tips());
      console.log('');
    }
    console.log(ui.dim('Type "exit" or /quit to end the session.'));
    console.log(ui.statusBar({ model: `/model ${activeModel.provider} (${activeModel.id})` }));
    console.log('');
    await startChatLoop(activeModel);
  }
};
