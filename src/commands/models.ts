import type * as Yargs from 'yargs';
import { config, getEffectiveActiveModel, PROVIDER_LABELS, getOpenAIApiKey, getGrokApiKey, getOpenRouterToken, getOllamaCloudApiKey } from '../config.js';
import type { ModelConfig, Provider } from '../config.js';
import chalk from 'chalk';
import ora from 'ora';
import { ui } from '../ui.js';

interface ModelsArgs {
  action?: string;
  id?: string;
  provider?: string;
}

export const modelsCommand: Yargs.CommandModule<{}, ModelsArgs> = {
  command: 'models <action>',
  describe: 'Manage AI models',
  builder: (yargs: Yargs.Argv) => yargs
    .positional('action', {
      describe: 'Action to perform',
      type: 'string',
      choices: ['add', 'add-openai', 'add-grok', 'add-ollama', 'add-ollama-cloud', 'add-openrouter', 'use', 'list', 'fetch-openai', 'fetch-grok', 'fetch-openrouter', 'fetch-ollama', 'fetch-ollama-cloud']
    })
    .option('id', {
      describe: 'Model ID (e.g., llama3, google/gemini-2.5-flash)',
      type: 'string',
      alias: 'i'
    })
    .option('provider', {
      describe: 'Provider (for "add" or "use": openai, grok, openrouter, ollama, ollama-cloud, gemini, controller)',
      type: 'string',
      choices: ['openai', 'grok', 'openrouter', 'ollama', 'ollama-cloud', 'gemini', 'controller'],
      alias: 'p'
    }),
  handler: async (argv: ModelsArgs) => {
    const { action, id, provider } = argv;

    if (action === 'list') {
      const models = config.get('registeredModels');
      const active = getEffectiveActiveModel();
      console.log(chalk.blue('\nRegistered Models:'));
      models.forEach((m: ModelConfig) => {
        const isActive = active?.id === m.id && active?.provider === m.provider;
        const label = PROVIDER_LABELS[m.provider as Provider] ?? m.provider;
        console.log(`${isActive ? chalk.green('★') : ' '} [${label}] ${m.id}`);
      });
      console.log('');
      return;
    }

    if (action === 'fetch-openai') {
      const apiKey = getOpenAIApiKey();
      if (!apiKey) {
        console.log(ui.error('OpenAI API key not set. Use: pokt config set-openai -v <key> ou defina OPENAI_API_KEY'));
        return;
      }
      const spinner = ora('Fetching OpenAI models...').start();
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) {
          spinner.fail(ui.error(`Failed to fetch OpenAI models: HTTP ${response.status}`));
          const body = await response.text();
          if (body) console.log(ui.dim(body.slice(0, 200)));
          return;
        }
        const data = await response.json() as any;
        const openaiModels = (data.data || []).map((m: any) => ({ provider: 'openai', id: m.id }));
        const currentModels = config.get('registeredModels');
        const otherModels = currentModels.filter((m: ModelConfig) => m.provider !== 'openai');
        config.set('registeredModels', [...otherModels, ...openaiModels]);
        spinner.succeed(ui.success(`Synchronized ${openaiModels.length} OpenAI models.`));
      } catch (error: any) {
        spinner.fail(ui.error(`Failed to fetch OpenAI models: ${error.message}`));
        console.log(ui.warn('Check your network and API key. Run: pokt config show'));
      }
      return;
    }

    if (action === 'fetch-grok') {
      const apiKey = getGrokApiKey();
      if (!apiKey) {
        console.log(ui.error('Grok (xAI) API key not set. Use: pokt config set-grok -v <key> ou defina XAI_API_KEY'));
        return;
      }
      const spinner = ora('Fetching Grok (xAI) models...').start();
      try {
        const response = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) {
          spinner.fail(ui.error(`Failed to fetch Grok (xAI) models: HTTP ${response.status}`));
          const body = await response.text();
          if (body) console.log(ui.dim(body.slice(0, 200)));
          return;
        }
        const data = await response.json() as any;
        const grokModels = (data.data || []).map((m: any) => ({ provider: 'grok', id: m.id }));
        const currentModels = config.get('registeredModels');
        const otherModels = currentModels.filter((m: ModelConfig) => m.provider !== 'grok');
        config.set('registeredModels', [...otherModels, ...grokModels]);
        spinner.succeed(ui.success(`Synchronized ${grokModels.length} Grok (xAI) models.`));
      } catch (error: any) {
        spinner.fail(ui.error(`Failed to fetch Grok (xAI) models: ${error.message}`));
        console.log(ui.warn('Check your network and API key. Run: pokt config show'));
      }
      return;
    }

    if (action === 'fetch-openrouter') {
      const spinner = ora('Fetching OpenRouter models...').start();
      try {
        const orToken = getOpenRouterToken();
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: orToken ? { Authorization: `Bearer ${orToken}` } : undefined,
        });
        if (!response.ok) {
          spinner.fail(ui.error(`Failed to fetch OpenRouter models: HTTP ${response.status}`));
          const body = await response.text();
          if (body) console.log(ui.dim(body.slice(0, 200)));
          console.log(ui.warn('Check your network and OpenRouter token. Run: pokt config show'));
          return;
        }
        const data = await response.json() as any;
        const openrouterModels = (data.data || []).map((m: any) => ({ provider: 'openrouter', id: m.id }));
        const currentModels = config.get('registeredModels');
        const otherModels = currentModels.filter((m: ModelConfig) => m.provider !== 'openrouter');
        config.set('registeredModels', [...otherModels, ...openrouterModels]);
        spinner.succeed(ui.success(`Synchronized ${openrouterModels.length} OpenRouter models.`));
      } catch (error: any) {
        spinner.fail(ui.error(`Failed to fetch OpenRouter models: ${error.message}`));
        console.log(ui.warn('Check your network. Run: pokt config show'));
      }
      return;
    }

    if (action === 'fetch-ollama') {
      const baseUrl = (config.get('ollamaBaseUrl') || 'http://localhost:11434').replace(/\/$/, '');
      const url = `${baseUrl}/api/tags`;
      const spinner = ora(`Fetching Ollama models (${url})...`).start();
      try {
        const response = await fetch(url);
        if (!response.ok) {
          spinner.fail(ui.error(`Failed to fetch Ollama models: HTTP ${response.status}`));
          console.log(ui.warn('Check Ollama is running and ollamaBaseUrl. Run: pokt config show'));
          return;
        }
        const data = await response.json() as { models?: { name: string }[] };
        const names = (data.models || []).map((m: { name: string }) => m.name);
        const ollamaModels = names.map((name: string) => ({ provider: 'ollama' as const, id: name }));
        const currentModels = config.get('registeredModels');
        const otherModels = currentModels.filter((m: ModelConfig) => m.provider !== 'ollama');
        config.set('registeredModels', [...otherModels, ...ollamaModels]);
        spinner.succeed(ui.success(`Synchronized ${ollamaModels.length} Ollama (local) models.`));
      } catch (error: any) {
        spinner.fail(ui.error(`Failed to fetch Ollama models: ${error.message}`));
        console.log(ui.warn('Check Ollama is running. Run: pokt config show'));
      }
      return;
    }

    if (action === 'fetch-ollama-cloud') {
      const apiKey = getOllamaCloudApiKey();
      if (!apiKey) {
        console.log(ui.error('Ollama Cloud API key not set. Run: pokt config set-ollama-cloud -v <key>'));
        console.log(ui.dim('Create keys at: https://ollama.com/settings/keys'));
        return;
      }
      const spinner = ora('Fetching Ollama Cloud models (https://ollama.com/api/tags)...').start();
      try {
        const response = await fetch('https://ollama.com/api/tags', {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!response.ok) {
          spinner.fail(ui.error(`Failed to fetch Ollama Cloud models: HTTP ${response.status}`));
          const body = await response.text();
          if (body) console.log(ui.dim(body.slice(0, 200)));
          console.log(ui.warn('Check your API key. Run: pokt config show'));
          return;
        }
        const data = await response.json() as { models?: { name: string }[] };
        const names = (data.models || []).map((m: { name: string }) => m.name);
        const ollamaCloudModels = names.map((name: string) => ({ provider: 'ollama-cloud' as const, id: name }));
        const currentModels = config.get('registeredModels');
        const otherModels = currentModels.filter((m: ModelConfig) => m.provider !== 'ollama-cloud');
        config.set('registeredModels', [...otherModels, ...ollamaCloudModels]);
        spinner.succeed(ui.success(`Synchronized ${ollamaCloudModels.length} Ollama Cloud models.`));
      } catch (error: any) {
        spinner.fail(ui.error(`Failed to fetch Ollama Cloud models: ${error.message}`));
        console.log(ui.warn('Check your network and API key. Run: pokt config show'));
      }
      return;
    }

    if (action === 'add') {
      const allowed: Array<'openai' | 'grok' | 'openrouter' | 'ollama' | 'ollama-cloud'> = ['openai', 'grok', 'openrouter', 'ollama', 'ollama-cloud'];
      if (!id) return console.log(ui.error('Error: --id is required for add. Example: pokt models add -p openrouter -i google/gemini-2.5-flash'));
      if (!provider || !allowed.includes(provider as any)) {
        return console.log(ui.error(`Error: --provider is required and must be one of: ${allowed.join(', ')}. Example: pokt models add -p openrouter -i <model-id>`));
      }
      const p = provider as 'openai' | 'grok' | 'openrouter' | 'ollama' | 'ollama-cloud';
      const models = config.get('registeredModels');
      if (!models.find((m: ModelConfig) => m.id === id && m.provider === p)) {
        models.push({ provider: p, id: id as string });
        config.set('registeredModels', models);
        const label = PROVIDER_LABELS[p as Provider] ?? p;
        console.log(ui.success(`Added ${label} model: ${id}`));
      } else {
        const label = PROVIDER_LABELS[p as Provider] ?? p;
        console.log(ui.warn(`Model ${id} already exists for ${label}.`));
      }
    } else if (action === 'add-openai') {
      if (!id) return console.log(ui.error('Error: --id is required for add-openai. Example: pokt models add-openai -i gpt-4o-mini'));
      const models = config.get('registeredModels');
      if (!models.find((m: ModelConfig) => m.id === id && m.provider === 'openai')) {
        models.push({ provider: 'openai', id: id as string });
        config.set('registeredModels', models);
        console.log(ui.success(`Added OpenAI model: ${id}`));
      } else {
        console.log(ui.warn(`Model ${id} already exists for OpenAI.`));
      }
    } else if (action === 'add-grok') {
      if (!id) return console.log(ui.error('Error: --id is required for add-grok. Example: pokt models add-grok -i grok-2-latest'));
      const models = config.get('registeredModels');
      if (!models.find((m: ModelConfig) => m.id === id && m.provider === 'grok')) {
        models.push({ provider: 'grok', id: id as string });
        config.set('registeredModels', models);
        console.log(ui.success(`Added Grok (xAI) model: ${id}`));
      } else {
        console.log(ui.warn(`Model ${id} already exists for Grok (xAI).`));
      }
    } else if (action === 'add-ollama') {
      if (!id) return console.log(ui.error('Error: --id is required for add-ollama'));
      const models = config.get('registeredModels');
      if (!models.find((m: ModelConfig) => m.id === id && m.provider === 'ollama')) {
        models.push({ provider: 'ollama', id: id as string });
        config.set('registeredModels', models);
        console.log(ui.success(`Added Ollama model: ${id}`));
      } else {
        console.log(ui.warn(`Model ${id} already exists for Ollama.`));
      }
    } else if (action === 'add-ollama-cloud') {
      if (!id) return console.log(ui.error('Error: --id is required for add-ollama-cloud'));
      const models = config.get('registeredModels');
      if (!models.find((m: ModelConfig) => m.id === id && m.provider === 'ollama-cloud')) {
        models.push({ provider: 'ollama-cloud', id: id as string });
        config.set('registeredModels', models);
        console.log(ui.success(`Added Ollama Cloud model: ${id}`));
      } else {
        console.log(ui.warn(`Model ${id} already exists for Ollama Cloud.`));
      }
    } else if (action === 'add-openrouter') {
      if (!id) return console.log(ui.error('Error: --id is required for add-openrouter. Example: pokt models add-openrouter -i google/gemini-2.5-flash'));
      const models = config.get('registeredModels');
      if (!models.find((m: ModelConfig) => m.id === id && m.provider === 'openrouter')) {
        models.push({ provider: 'openrouter', id: id as string });
        config.set('registeredModels', models);
        console.log(ui.success(`Added OpenRouter model: ${id}`));
      } else {
        console.log(ui.warn(`Model ${id} already exists for OpenRouter.`));
      }
    } else if (action === 'use') {
      if (!id || !provider) return console.log(ui.error('Error: --id and --provider are required for use'));
      const models = config.get('registeredModels');
      const model = models.find((m: ModelConfig) => m.id === id && m.provider === provider);
      if (model) {
        config.set('activeModel', model);
        console.log(ui.success(`Active model set to [${provider}] ${id}`));
      } else {
        console.log(ui.error(`Model ${id} for provider ${provider} not found. Run: pokt models list`));
      }
    }
  }
};
