import Conf from 'conf';
export const PROVIDER_LABELS = {
    controller: 'Pokt API (Controller)',
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
        openrouterToken: '',
        geminiApiKey: '',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaCloudApiKey: '',
        controllerBaseUrl: DEFAULT_CONTROLLER_URL,
        poktToken: '',
        registeredModels: [
            { provider: 'controller', id: 'default' },
            { provider: 'openrouter', id: 'google/gemini-2.0-flash-001' },
            { provider: 'openrouter', id: 'anthropic/claude-3.5-sonnet' },
            { provider: 'gemini', id: 'gemini-1.5-flash' },
            { provider: 'gemini', id: 'gemini-1.5-pro' }
        ],
        activeModel: null,
        mcpServers: [],
    }
});
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
    if (config.get('poktToken')) {
        const c = models.find((m) => m.provider === 'controller');
        if (c)
            return c;
    }
    if (config.get('openrouterToken')) {
        const o = models.find((m) => m.provider === 'openrouter');
        if (o)
            return o;
    }
    if (config.get('geminiApiKey')) {
        const g = models.find((m) => m.provider === 'gemini');
        if (g)
            return g;
    }
    if (config.get('ollamaCloudApiKey')) {
        const oc = models.find((m) => m.provider === 'ollama-cloud');
        if (oc)
            return oc;
    }
    const ollama = models.find((m) => m.provider === 'ollama');
    if (ollama)
        return ollama;
    return models[0] ?? null;
}
