import type * as Yargs from 'yargs';
import {
  config,
  ALL_PROVIDERS,
  getOpenAIApiKey,
  getGrokApiKey,
  getOpenRouterToken,
  getGeminiApiKey,
  getOllamaCloudApiKey,
  getPoktToken,
  getProPortalBaseUrl,
} from '../config.js';
import type { Provider } from '../config.js';
import { ui } from '../ui.js';

interface ProviderArgs {
  provider?: string;
}

export const providerCommand: Yargs.CommandModule<{}, ProviderArgs> = {
  command: 'provider use <provider>',
  describe: 'Switch API provider (casa de API): controller (Pokt), openai, grok, openrouter, gemini, ollama, ollama-cloud',
  builder: (yargs: Yargs.Argv) => yargs
    .positional('provider', {
      describe: 'Provider to use as primary',
      type: 'string',
      choices: [...ALL_PROVIDERS]
    }),
  handler: (argv: ProviderArgs) => {
    const provider = argv.provider as Provider;
    const models = config.get('registeredModels');
    const model = models.find((m: import('../config.js').ModelConfig) => m.provider === provider);

    if (!model) {
      if (provider === 'controller') {
        console.log(ui.error('Controller model not found. Add it with: pokt config set-pokt-token -v <token>'));
      } else if (provider === 'openai') {
        console.log(ui.error('No OpenAI model. Add one with: pokt models add-openai -i <id>'));
      } else if (provider === 'grok') {
        console.log(ui.error('No Grok (xAI) model. Add one with: pokt models add-grok -i <id>'));
      } else if (provider === 'openrouter') {
        console.log(ui.error('No OpenRouter model. Run: pokt models fetch-openrouter then pokt models list'));
      } else if (provider === 'ollama') {
        console.log(ui.error('No Ollama (local) model. Run: pokt models fetch-ollama then pokt models list'));
      } else if (provider === 'ollama-cloud') {
        console.log(ui.error('No Ollama Cloud model. Run: pokt models fetch-ollama-cloud then pokt models list'));
      } else {
        console.log(ui.error(`No model for provider "${provider}". Run: pokt models list and add one.`));
      }
      return;
    }

    if (provider === 'openai' && !getOpenAIApiKey()) {
      console.log(ui.error('OpenAI API key not set. Use: pokt config set-openai -v <key>'));
      return;
    }
    if (provider === 'grok' && !getGrokApiKey()) {
      console.log(ui.error('Grok (xAI) API key not set. Use: pokt config set-grok -v <key>'));
      return;
    }
    if (provider === 'openrouter' && !getOpenRouterToken()) {
      console.log(ui.error('OpenRouter token not set. Use: pokt config set-openrouter -v <token>'));
      return;
    }
    if (provider === 'gemini' && !getGeminiApiKey()) {
      console.log(ui.error('Gemini API key not set. Use: pokt config set-gemini -v <key>'));
      return;
    }
    if (provider === 'controller' && !getPoktToken()) {
      console.log(
        ui.error(
          `Pokt token not set. Painel: ${getProPortalBaseUrl()} — pokt config set-pokt-token -v <token>`
        )
      );
      return;
    }
    if (provider === 'ollama-cloud' && !getOllamaCloudApiKey()) {
      console.log(ui.error('Ollama Cloud API key not set. Use: pokt config set-ollama-cloud -v <key>'));
      return;
    }

    config.set('activeModel', model);
    console.log(ui.success(`Primary provider set to [${provider}] (model: ${model.id}). Use "pokt chat" to start.`));
  }
};
