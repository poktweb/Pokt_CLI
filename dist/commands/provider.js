import { config, ALL_PROVIDERS } from '../config.js';
import { ui } from '../ui.js';
export const providerCommand = {
    command: 'provider use <provider>',
    describe: 'Switch API provider (casa de API): controller (Pokt), openrouter, gemini, ollama, ollama-cloud',
    builder: (yargs) => yargs
        .positional('provider', {
        describe: 'Provider to use as primary',
        type: 'string',
        choices: [...ALL_PROVIDERS]
    }),
    handler: (argv) => {
        const provider = argv.provider;
        const models = config.get('registeredModels');
        const model = models.find((m) => m.provider === provider);
        if (!model) {
            if (provider === 'controller') {
                console.log(ui.error('Controller model not found. Add it with: pokt config set-pokt-token -v <token>'));
            }
            else if (provider === 'openrouter') {
                console.log(ui.error('No OpenRouter model. Run: pokt models fetch-openrouter then pokt models list'));
            }
            else if (provider === 'ollama') {
                console.log(ui.error('No Ollama (local) model. Run: pokt models fetch-ollama then pokt models list'));
            }
            else if (provider === 'ollama-cloud') {
                console.log(ui.error('No Ollama Cloud model. Run: pokt models fetch-ollama-cloud then pokt models list'));
            }
            else {
                console.log(ui.error(`No model for provider "${provider}". Run: pokt models list and add one.`));
            }
            return;
        }
        if (provider === 'openrouter' && !config.get('openrouterToken')) {
            console.log(ui.error('OpenRouter token not set. Use: pokt config set-openrouter -v <token>'));
            return;
        }
        if (provider === 'gemini' && !config.get('geminiApiKey')) {
            console.log(ui.error('Gemini API key not set. Use: pokt config set-gemini -v <key>'));
            return;
        }
        if (provider === 'controller' && !config.get('poktToken')) {
            console.log(ui.error('Pokt token not set. Use: pokt config set-pokt-token -v <token>'));
            return;
        }
        if (provider === 'ollama-cloud' && !config.get('ollamaCloudApiKey')) {
            console.log(ui.error('Ollama Cloud API key not set. Use: pokt config set-ollama-cloud -v <key>'));
            return;
        }
        config.set('activeModel', model);
        console.log(ui.success(`Primary provider set to [${provider}] (model: ${model.id}). Use "pokt chat" to start.`));
    }
};
