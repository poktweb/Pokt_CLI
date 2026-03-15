import { config } from '../config.js';
import chalk from 'chalk';
export const configCommand = {
    command: 'config <action>',
    describe: 'Configure Pokt CLI settings',
    builder: (yargs) => yargs
        .positional('action', {
        describe: 'Action to perform',
        type: 'string',
        choices: ['set-openrouter', 'set-ollama', 'set-gemini', 'set-google-client-id', 'set-google-client-secret']
    })
        .option('value', {
        describe: 'The value to set',
        type: 'string',
        demandOption: true,
        alias: 'v'
    }),
    handler: (argv) => {
        const { action, value } = argv;
        if (action === 'set-openrouter') {
            config.set('openrouterToken', value);
            console.log(chalk.green('✔ OpenRouter token saved successfully.'));
        }
        else if (action === 'set-ollama') {
            config.set('ollamaBaseUrl', value);
            console.log(chalk.green(`✔ Ollama base URL set to: ${value}`));
        }
        else if (action === 'set-gemini') {
            config.set('geminiApiKey', value);
            console.log(chalk.green('✔ Gemini API key saved successfully.'));
        }
        else if (action === 'set-google-client-id') {
            config.set('googleClientId', value);
            console.log(chalk.green('✔ Google Client ID saved successfully.'));
        }
        else if (action === 'set-google-client-secret') {
            config.set('googleClientSecret', value);
            console.log(chalk.green('✔ Google Client Secret saved successfully.'));
        }
    }
};
