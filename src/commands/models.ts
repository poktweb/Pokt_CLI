import { CommandModule } from 'yargs';
import { config, Provider } from '../config.js';
import chalk from 'chalk';
import ora from 'ora';

export const modelsCommand: CommandModule = {
  command: 'models <action>',
  describe: 'Manage AI models',
  builder: (yargs) => yargs
    .positional('action', {
      describe: 'Action to perform',
      type: 'string',
      choices: ['add-ollama', 'use', 'list', 'fetch-openrouter']
    })
    .option('id', {
      describe: 'Model ID (e.g., llama3, google/gemini-2.5-flash)',
      type: 'string',
      alias: 'i'
    })
    .option('provider', {
      describe: 'Provider for the use command',
      type: 'string',
      choices: ['openrouter', 'ollama', 'gemini'],
      alias: 'p'
    }),
  handler: async (argv) => {
    const { action, id, provider } = argv;

    if (action === 'list') {
      const models = config.get('registeredModels');
      const active = config.get('activeModel');
      console.log(chalk.blue('\nRegistered Models:'));
      models.forEach(m => {
        const isActive = active?.id === m.id && active?.provider === m.provider;
        console.log(`${isActive ? chalk.green('★') : ' '} [${m.provider}] ${m.id}`);
      });
      console.log('');
      return;
    }

    if (action === 'fetch-openrouter') {
      const spinner = ora('Fetching OpenRouter models...').start();
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        const data = await response.json() as any;
        const openrouterModels = data.data.map((m: any) => ({ provider: 'openrouter', id: m.id }));
        
        const currentModels = config.get('registeredModels');
        const otherModels = currentModels.filter(m => m.provider !== 'openrouter');
        config.set('registeredModels', [...otherModels, ...openrouterModels]);
        
        spinner.succeed(chalk.green(`✔ Synchronized ${openrouterModels.length} OpenRouter models.`));
      } catch (error: any) {
        spinner.fail(chalk.red(`Error fetching models: ${error.message}`));
      }
      return;
    }

    if (action === 'add-ollama') {
      if (!id) return console.log(chalk.red('Error: --id is required for add-ollama'));
      const models = config.get('registeredModels');
      if (!models.find(m => m.id === id && m.provider === 'ollama')) {
        models.push({ provider: 'ollama', id: id as string });
        config.set('registeredModels', models);
        console.log(chalk.green(`✔ Added Ollama model: ${id}`));
      } else {
        console.log(chalk.yellow(`Model ${id} already exists for Ollama.`));
      }
    } else if (action === 'use') {
      if (!id || !provider) return console.log(chalk.red('Error: --id and --provider are required for use'));
      const models = config.get('registeredModels');
      const model = models.find(m => m.id === id && m.provider === provider);
      if (model) {
        config.set('activeModel', model);
        console.log(chalk.green(`✔ Active model set to [${provider}] ${id}`));
      } else {
        console.log(chalk.red(`Error: Model ${id} for provider ${provider} not found in registered models.`));
      }
    }
  }
};
