import ora from 'ora';
import { ui } from '../ui.js';
import { PROVIDER_LABELS, getEffectiveActiveModel, getOpenAIApiKey, getGrokApiKey, getOpenRouterToken, getGeminiApiKey, getOllamaBaseUrl, getOllamaCloudApiKey, getPoktToken, getPoktApiBaseUrl, getProPortalBaseUrl, getTokenPurchaseUrl, } from '../config.js';
import { getClient } from '../chat/client.js';
function mask(value) {
    if (!value)
        return '(not set)';
    if (value.length <= 8)
        return '****';
    return value.slice(0, 4) + '****' + value.slice(-2);
}
async function checkModelsEndpoint(client) {
    // OpenAI SDK chama GET /models; funciona na maioria dos OpenAI-compat.
    const res = await client.models.list();
    const data = Array.isArray(res?.data) ? res.data : [];
    return data.length;
}
async function checkOllamaTags() {
    const baseUrl = getOllamaBaseUrl().replace(/\/$/, '');
    const url = `${baseUrl}/api/tags`;
    const r = await fetch(url);
    if (!r.ok)
        throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return Array.isArray(data?.models) ? data.models.length : 0;
}
export const doctorCommand = {
    command: 'doctor',
    describe: 'Diagnosticar credenciais e conectividade do provider/model atual',
    handler: async () => {
        const active = getEffectiveActiveModel();
        if (!active) {
            console.log(ui.error('Nenhum modelo ativo. Rode: pokt models list'));
            return;
        }
        const label = PROVIDER_LABELS[active.provider] ?? active.provider;
        console.log(ui.dim(`\nProvider ativo: ${label}`));
        console.log(ui.dim(`Model ativo: ${active.id}\n`));
        // 1) checar credenciais (env ou conf)
        const required = {
            controller: { name: 'POKT_TOKEN', value: getPoktToken(), hint: 'pokt config set-pokt-token -v <token>' },
            openai: { name: 'OPENAI_API_KEY', value: getOpenAIApiKey(), hint: 'pokt config set-openai -v <key>' },
            grok: { name: 'XAI_API_KEY', value: getGrokApiKey(), hint: 'pokt config set-grok -v <key>' },
            openrouter: { name: 'OPENROUTER_API_KEY', value: getOpenRouterToken(), hint: 'pokt config set-openrouter -v <token>' },
            gemini: { name: 'GEMINI_API_KEY', value: getGeminiApiKey(), hint: 'pokt config set-gemini -v <key>' },
            'ollama-cloud': { name: 'OLLAMA_CLOUD_API_KEY', value: getOllamaCloudApiKey(), hint: 'pokt config set-ollama-cloud -v <key>' },
            ollama: null,
        };
        const req = required[active.provider] ?? null;
        if (req) {
            if (!req.value) {
                console.log(ui.error(`Faltando credencial: ${req.name}`));
                if (req.hint)
                    console.log(ui.dim(`Dica: ${req.hint}`));
                return;
            }
            console.log(ui.success(`Credencial OK: ${req.name} = ${mask(req.value)}`));
            if (active.provider === 'controller') {
                console.log(ui.dim(`  API Pokt (chat): ${getPoktApiBaseUrl()}`));
                console.log(ui.dim(`  Painel / serviço: ${getProPortalBaseUrl()}`));
                console.log(ui.dim(`  Comprar token: ${getTokenPurchaseUrl()}`));
            }
        }
        else if (active.provider === 'ollama') {
            console.log(ui.success(`Ollama (local) não precisa de chave. Base URL: ${getOllamaBaseUrl()}`));
        }
        // 2) checar conectividade
        const spinner = ora('Testando conexão...').start();
        try {
            if (active.provider === 'ollama') {
                const count = await checkOllamaTags();
                spinner.succeed(ui.success(`Conexão OK (Ollama). Modelos encontrados: ${count}`));
                return;
            }
            const client = await getClient(active);
            const count = await checkModelsEndpoint(client);
            spinner.succeed(ui.success(`Conexão OK (${label}). /models retornou ${count} modelos.`));
        }
        catch (e) {
            spinner.fail(ui.error(`Falha ao testar conexão: ${e?.message ?? String(e)}`));
            console.log(ui.warn('Sugestões:'));
            console.log(ui.dim('- Verifique sua chave/token'));
            console.log(ui.dim('- Verifique sua rede/proxy/firewall'));
            console.log(ui.dim('- Rode: pokt config show'));
        }
    }
};
