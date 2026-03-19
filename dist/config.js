import Conf from 'conf';
export const PROVIDER_LABELS = {
    controller: 'Pokt API (Controller)',
    openai: 'OpenAI',
    grok: 'Grok (xAI)',
    openrouter: 'OpenRouter',
    gemini: 'Gemini',
    ollama: 'Ollama (local)',
    'ollama-cloud': 'Ollama Cloud'
};
/** Lista de todos os provedores disponíveis (único lugar para incluir novos no futuro) */
export const ALL_PROVIDERS = Object.keys(PROVIDER_LABELS);
const DEFAULT_CONTROLLER_URL = 'https://pokt-cli-controller.vercel.app';
export const config = new Conf({
    projectName: 'pokt-cli',
    defaults: {
        openaiApiKey: '',
        grokApiKey: '',
        openrouterToken: '',
        geminiApiKey: '',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaCloudApiKey: '',
        controllerBaseUrl: DEFAULT_CONTROLLER_URL,
        poktToken: '',
        registeredModels: [
            { provider: 'controller', id: 'default' },
            { provider: 'openai', id: 'gpt-4o-mini' },
            { provider: 'grok', id: 'grok-2-latest' },
            { provider: 'openrouter', id: 'google/gemini-2.0-flash-001' },
            { provider: 'openrouter', id: 'anthropic/claude-3.5-sonnet' },
            { provider: 'gemini', id: 'gemini-1.5-flash' },
            { provider: 'gemini', id: 'gemini-1.5-pro' }
        ],
        activeModel: null,
        mcpServers: [],
    }
});
function readEnvFirst(envNames) {
    for (const n of envNames) {
        const v = process.env[n];
        if (typeof v === 'string' && v.trim() !== '')
            return v.trim();
    }
    return '';
}
export const env = {
    openaiApiKey: ['OPENAI_API_KEY'],
    grokApiKey: ['XAI_API_KEY', 'GROK_API_KEY'],
    openrouterToken: ['OPENROUTER_API_KEY', 'OPENROUTER_TOKEN'],
    geminiApiKey: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    ollamaBaseUrl: ['OLLAMA_BASE_URL'],
    ollamaCloudApiKey: ['OLLAMA_CLOUD_API_KEY'],
    poktToken: ['POKT_TOKEN'],
};
export function getOpenAIApiKey() {
    return readEnvFirst(env.openaiApiKey) || config.get('openaiApiKey') || '';
}
export function getGrokApiKey() {
    return readEnvFirst(env.grokApiKey) || config.get('grokApiKey') || '';
}
export function getOpenRouterToken() {
    return readEnvFirst(env.openrouterToken) || config.get('openrouterToken') || '';
}
export function getGeminiApiKey() {
    return readEnvFirst(env.geminiApiKey) || config.get('geminiApiKey') || '';
}
export function getOllamaBaseUrl() {
    const fromEnv = readEnvFirst(env.ollamaBaseUrl);
    const url = (fromEnv || config.get('ollamaBaseUrl') || 'http://localhost:11434').replace(/\/$/, '');
    return url;
}
export function getOllamaCloudApiKey() {
    return readEnvFirst(env.ollamaCloudApiKey) || config.get('ollamaCloudApiKey') || '';
}
export function getPoktToken() {
    return readEnvFirst(env.poktToken) || config.get('poktToken') || '';
}
export const getControllerBaseUrl = () => {
    const url = config.get('controllerBaseUrl') || DEFAULT_CONTROLLER_URL;
    return url.replace(/\/$/, '');
};
/** Página inicial do Pokt Pro (aí tem o botão de assinatura/pagamento). */
export const getProPurchaseUrl = () => getControllerBaseUrl();
/** Prioridade: modelo ativo explícito → Pokt (controller) se token setado → OpenRouter → Gemini → Ollama Cloud → Ollama local */
export function getEffectiveActiveModel() {
    const explicit = config.get('activeModel');
    if (explicit)
        return explicit;
    const models = config.get('registeredModels');
    if (getPoktToken()) {
        const c = models.find((m) => m.provider === 'controller');
        if (c)
            return c;
    }
    if (getOpenAIApiKey()) {
        const oa = models.find((m) => m.provider === 'openai');
        if (oa)
            return oa;
    }
    if (getGrokApiKey()) {
        const gx = models.find((m) => m.provider === 'grok');
        if (gx)
            return gx;
    }
    if (getOpenRouterToken()) {
        const o = models.find((m) => m.provider === 'openrouter');
        if (o)
            return o;
    }
    if (getGeminiApiKey()) {
        const g = models.find((m) => m.provider === 'gemini');
        if (g)
            return g;
    }
    if (getOllamaCloudApiKey()) {
        const oc = models.find((m) => m.provider === 'ollama-cloud');
        if (oc)
            return oc;
    }
    const ollama = models.find((m) => m.provider === 'ollama');
    if (ollama)
        return ollama;
    return models[0] ?? null;
}
