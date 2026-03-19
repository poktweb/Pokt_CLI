import type * as Yargs from 'yargs';
import { config, getControllerBaseUrl } from '../config.js';
import type { ModelConfig } from '../config.js';
import chalk from 'chalk';
import { ui } from '../ui.js';

interface ConfigArgs {
  action?: string;
  value?: string | string[];
}

export const configCommand: Yargs.CommandModule<{}, ConfigArgs> = {
  command: 'config <action>',
  describe: 'Configure Pokt CLI settings',
  builder: (yargs: Yargs.Argv) => yargs
    .positional('action', {
      describe: 'Action to perform',
      type: 'string',
      choices: ['set-openai', 'set-grok', 'set-openrouter', 'set-ollama', 'set-ollama-cloud', 'set-gemini', 'set-pokt-token', 'clear-openrouter', 'clear-openai', 'clear-grok', 'show']
    })
    .option('value', {
      describe: 'The value to set',
      type: 'string',
      alias: 'v'
    }),
  handler: (argv: ConfigArgs) => {
    const { action, value } = argv;
    if (action === 'show') {
      const openai = config.get('openaiApiKey');
      const grok = config.get('grokApiKey');
      const openrouter = config.get('openrouterToken');
      const gemini = config.get('geminiApiKey');
      const ollama = config.get('ollamaBaseUrl');
      const ollamaCloud = config.get('ollamaCloudApiKey');
      const poktToken = config.get('poktToken');
      console.log(chalk.blue('\nCurrent config (tokens masked):'));
      console.log(ui.dim('  OpenAI API Key:'), openai ? openai.slice(0, 8) + '****' : '(not set)');
      console.log(ui.dim('  Grok (xAI) API Key:'), grok ? grok.slice(0, 8) + '****' : '(not set)');
      console.log(ui.dim('  OpenRouter Token:'), openrouter ? openrouter.slice(0, 8) + '****' : '(not set)');
      console.log(ui.dim('  Gemini API Key:'), gemini ? gemini.slice(0, 8) + '****' : '(not set)');
      console.log(ui.dim('  Ollama Base URL (local):'), ollama || '(not set)');
      console.log(ui.dim('  Ollama Cloud API Key:'), ollamaCloud ? ollamaCloud.slice(0, 8) + '****' : '(not set) — https://ollama.com/settings/keys');
      console.log(ui.dim('  Controller URL:'), getControllerBaseUrl(), ui.dim('(já configurado)'));
      console.log(ui.dim('  Pokt Token:'), poktToken ? poktToken.slice(0, 10) + '****' : '(not set) — use: pokt config set-pokt-token -v <token>');
      console.log(ui.warn('\nTokens are stored in your user config directory. Do not share it.\n'));
      return;
    }
    if (action === 'clear-openrouter') {
      config.set('openrouterToken', '');
      console.log(ui.success('OpenRouter token cleared.'));
      return;
    }
    if (action === 'clear-openai') {
      config.set('openaiApiKey', '');
      console.log(ui.success('OpenAI API key cleared.'));
      return;
    }
    if (action === 'clear-grok') {
      config.set('grokApiKey', '');
      console.log(ui.success('Grok (xAI) API key cleared.'));
      return;
    }
    if (action !== 'set-openai' && action !== 'set-grok' && action !== 'set-openrouter' && action !== 'set-ollama' && action !== 'set-ollama-cloud' && action !== 'set-gemini' && action !== 'set-pokt-token') return;
    const raw = Array.isArray(value) ? value[0] : value;
    const strValue = typeof raw === 'string' ? raw : (raw != null ? String(raw) : '');
    if (strValue === '') {
      console.log(ui.error('Error: --value is required. Use: pokt config ' + action + ' -v <value>'));
      return;
    }
    if (action === 'set-openai') {
      config.set('openaiApiKey', strValue);
      console.log(ui.success('OpenAI API key saved successfully.'));
    } else if (action === 'set-grok') {
      config.set('grokApiKey', strValue);
      console.log(ui.success('Grok (xAI) API key saved successfully.'));
    } else if (action === 'set-openrouter') {
      config.set('openrouterToken', strValue);
      console.log(ui.success('OpenRouter token saved successfully.'));
    } else if (action === 'set-ollama') {
      config.set('ollamaBaseUrl', strValue);
      console.log(ui.success(`Ollama base URL set to: ${strValue}`));
    } else if (action === 'set-ollama-cloud') {
      config.set('ollamaCloudApiKey', strValue);
      console.log(ui.success('Ollama Cloud API key saved. Create keys at: https://ollama.com/settings/keys'));
    } else if (action === 'set-gemini') {
      config.set('geminiApiKey', strValue);
      console.log(ui.success('Gemini API key saved successfully.'));
    } else if (action === 'set-pokt-token') {
      config.set('poktToken', strValue);
      const controllerModel = { provider: 'controller' as const, id: 'default' };
      const models = config.get('registeredModels');
      if (!models.some((m: ModelConfig) => m.provider === 'controller' && m.id === 'default')) {
        config.set('registeredModels', [controllerModel, ...models]);
      }
      config.set('activeModel', controllerModel);
      console.log(ui.success('Pokt token salvo. Controller é seu provedor principal. Gere tokens em: https://pokt-cli-controller.vercel.app'));
    }
  }
};
