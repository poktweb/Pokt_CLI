#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { configCommand } from '../commands/config.js';
import { modelsCommand } from '../commands/models.js';
import { chatCommand } from '../commands/chat.js';
import { authCommand } from '../commands/auth.js';
import prompts from 'prompts';
import chalk from 'chalk';
const argv = hideBin(process.argv);
if (argv.length === 0) {
    showMenu();
}
else {
    yargs(argv)
        .scriptName('pokt')
        .usage('$0 <cmd> [args]')
        .command(configCommand)
        .command(modelsCommand)
        .command(chatCommand)
        .command(authCommand)
        .demandCommand(1, 'You need at least one command before moving on')
        .help()
        .parse();
}
async function showMenu() {
    console.log(chalk.blue.bold('\n--- POKT CLI: Vibe Coding System ---\n'));
    const response = await prompts({
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
            { title: '💬 Start Chat (Vibe Coding)', value: 'chat' },
            { title: '🤖 Select AI Model', value: 'models' },
            { title: '⚙️  Configure API Keys/URLs', value: 'config' },
            { title: '🔐 Google Login', value: 'auth' },
            { title: '❌ Exit', value: 'exit' }
        ]
    });
    if (!response.action || response.action === 'exit') {
        process.exit(0);
    }
    // Handle sub-menus based on selection
    if (response.action === 'chat') {
        // Run chat directly
        const { chatCommand } = await import('../commands/chat.js');
        chatCommand.handler({});
    }
    else if (response.action === 'models') {
        await handleModelsMenu();
    }
    else if (response.action === 'config') {
        await handleConfigMenu();
    }
    else if (response.action === 'auth') {
        const { loginWithGoogle } = await import('../auth/google.js');
        await loginWithGoogle();
    }
}
async function handleModelsMenu() {
    const { config } = await import('../config.js');
    const models = config.get('registeredModels');
    const active = config.get('activeModel');
    const response = await prompts({
        type: 'select',
        name: 'modelIdx',
        message: 'Select a model to use:',
        choices: [
            ...models.map((m, i) => ({
                title: `${active?.id === m.id && active?.provider === m.provider ? '★ ' : ''}[${m.provider}] ${m.id}`,
                value: i
            })),
            { title: '🔄 Fetch OpenRouter Models', value: 'fetch' },
            { title: '🔙 Back', value: 'back' }
        ]
    });
    if (response.modelIdx === 'back')
        return showMenu();
    if (response.modelIdx === 'fetch') {
        // We can simulate the command or call the handler
        const { modelsCommand } = await import('../commands/models.js');
        await modelsCommand.handler({ action: 'fetch-openrouter' });
        return handleModelsMenu();
    }
    if (typeof response.modelIdx === 'number') {
        const selected = models[response.modelIdx];
        config.set('activeModel', selected);
        console.log(chalk.green(`\n✔ Active model set to [${selected.provider}] ${selected.id}`));
        return showMenu();
    }
}
async function handleConfigMenu() {
    const { config } = await import('../config.js');
    const response = await prompts({
        type: 'select',
        name: 'type',
        message: 'Which setting to configure?',
        choices: [
            { title: 'Gemini API Key', value: 'set-gemini' },
            { title: 'OpenRouter Token', value: 'set-openrouter' },
            { title: 'Ollama Base URL', value: 'set-ollama' },
            { title: 'Google OAuth Client ID', value: 'set-google-client-id' },
            { title: 'Google OAuth Client Secret', value: 'set-google-client-secret' },
            { title: '🔙 Back', value: 'back' }
        ]
    });
    if (response.type === 'back')
        return showMenu();
    const valueResponse = await prompts({
        type: 'text',
        name: 'val',
        message: `Enter the value for ${response.type}:`
    });
    if (valueResponse.val) {
        const keyMap = {
            'set-gemini': 'geminiApiKey',
            'set-openrouter': 'openrouterToken',
            'set-ollama': 'ollamaBaseUrl',
            'set-google-client-id': 'googleClientId',
            'set-google-client-secret': 'googleClientSecret'
        };
        config.set(keyMap[response.type], valueResponse.val);
        console.log(chalk.green(`\n✔ Config updated.`));
    }
    return handleConfigMenu();
}
