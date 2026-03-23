import { getEffectiveActiveModel, getOpenAIApiKey, getGrokApiKey, getOpenRouterToken, getGeminiApiKey, getOllamaCloudApiKey, getPoktToken, } from '../config.js';
import { startChatLoop } from '../chat/loop.js';
import { ui } from '../ui.js';
export const chatCommand = {
    command: 'chat',
    describe: 'Start a Vibe Coding chat session',
    handler: async (argv) => {
        const fromMenu = argv?.fromMenu;
        const activeModel = getEffectiveActiveModel();
        if (!activeModel) {
            console.log(ui.error('No active model selected. Run: pokt models list then pokt models use -p <provider> -i <id>'));
            return;
        }
        if (activeModel.provider === 'openrouter' && !getOpenRouterToken()) {
            console.log(ui.error('OpenRouter token not set. Use: pokt config set-openrouter -v <token>'));
            return;
        }
        if (activeModel.provider === 'openai' && !getOpenAIApiKey()) {
            console.log(ui.error('OpenAI API key not set. Use: pokt config set-openai -v <key>'));
            return;
        }
        if (activeModel.provider === 'grok' && !getGrokApiKey()) {
            console.log(ui.error('Grok (xAI) API key not set. Use: pokt config set-grok -v <key>'));
            return;
        }
        if (activeModel.provider === 'gemini' && !getGeminiApiKey()) {
            console.log(ui.error('Gemini API key not set. Use: pokt config set-gemini -v <key>'));
            return;
        }
        if (activeModel.provider === 'ollama-cloud' && !getOllamaCloudApiKey()) {
            console.log(ui.error('Ollama Cloud API key not set. Use: pokt config set-ollama-cloud -v <key>'));
            return;
        }
        if (activeModel.provider === 'controller') {
            if (!getPoktToken()) {
                console.log(ui.error('Pokt token not set. Use: pokt config set-pokt-token -v <token>'));
                return;
            }
        }
        // Se veio do menu interativo, não repetir banner/tips (já foram exibidos)
        if (!fromMenu) {
            await ui.printBanner({ animate: true });
            console.log(ui.statusLine(`[${activeModel.provider}] ${activeModel.id}`));
            console.log('');
            console.log(ui.tips());
            console.log('');
        }
        console.log(ui.dim('Type "exit" or /quit to end the session.'));
        console.log(ui.statusBar({ cwd: process.cwd(), model: `/model ${activeModel.provider} (${activeModel.id})` }));
        console.log('');
        await startChatLoop(activeModel);
    }
};
