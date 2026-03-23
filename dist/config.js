import Conf from 'conf';
import { randomUUID } from 'crypto';
import os from 'os';
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
/** Serviço Pokt na Railway: API (`/api/v1`), painel e tudo que substituiu o host antigo da Vercel. */
const DEFAULT_POKT_SERVICE_BASE_URL = 'https://poktcliback-production.up.railway.app';
/** Somente fluxo de compra de token (Stripe / “Torne-se Pro”) — permanece no Controller Vercel. */
const DEFAULT_TOKEN_PURCHASE_BASE_URL = 'https://pokt-cli-controller.vercel.app';
/** Host legado: configs antigas são migradas automaticamente para `DEFAULT_POKT_SERVICE_BASE_URL`. */
const LEGACY_VERCEL_POKT_HOST = 'pokt-cli-controller.vercel.app';
function normalizeBaseUrl(url) {
    return url.trim().replace(/\/$/, '');
}
function isLegacyVercelPoktUrl(url) {
    try {
        const u = new URL(url.trim());
        return u.hostname.toLowerCase() === LEGACY_VERCEL_POKT_HOST;
    }
    catch {
        return false;
    }
}
export const config = new Conf({
    projectName: 'pokt-cli',
    defaults: {
        openaiApiKey: '',
        grokApiKey: '',
        openrouterToken: '',
        geminiApiKey: '',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaCloudApiKey: '',
        controllerBaseUrl: DEFAULT_POKT_SERVICE_BASE_URL,
        poktApiBaseUrl: DEFAULT_POKT_SERVICE_BASE_URL,
        tokenPurchaseBaseUrl: DEFAULT_TOKEN_PURCHASE_BASE_URL,
        poktToken: '',
        cliInstallId: '',
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
    disableTelemetry: ['POKT_DISABLE_TELEMETRY'],
    poktApiBaseUrl: ['POKT_API_BASE_URL'],
    /** Painel e URLs gerais (Railway) */
    proPortalUrl: ['POKT_PRO_PORTAL_URL', 'POKT_CONTROLLER_PORTAL_URL'],
    /** Apenas página de compra de token (Vercel) */
    tokenPurchaseUrl: ['POKT_TOKEN_PURCHASE_URL'],
};
/**
 * Migração: quem tinha a URL antiga da Vercel em API ou portal passa a usar a Railway.
 * A URL de compra de token não é alterada aqui.
 */
function migrateLegacyPoktUrls() {
    const target = DEFAULT_POKT_SERVICE_BASE_URL;
    for (const key of ['poktApiBaseUrl', 'controllerBaseUrl']) {
        const val = config.get(key);
        if (typeof val === 'string' && val.trim() !== '' && isLegacyVercelPoktUrl(val)) {
            config.set(key, target);
        }
    }
}
migrateLegacyPoktUrls();
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
/** UUID persistente por máquina/instalação (identifica uso no painel quando não há token Pokt). */
export function getOrCreateCliInstallId() {
    let id = config.get('cliInstallId');
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
        id = randomUUID();
        config.set('cliInstallId', id);
    }
    return id;
}
/** Nome do PC (sanitizado) para exibição no log de uso. */
export function getCliHostLabel() {
    try {
        const h = os.hostname().replace(/[^\w.-]+/g, '_').slice(0, 120);
        return h || 'PC';
    }
    catch {
        return 'PC';
    }
}
export function isCliTelemetryDisabled() {
    const v = readEnvFirst(env.disableTelemetry);
    return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}
/** Base da API só para provider `controller` (Bearer Pokt). OpenAI direto usa outro ramo no getClient. */
export function getPoktApiBaseUrl() {
    const fromEnv = readEnvFirst(env.poktApiBaseUrl);
    const url = fromEnv || config.get('poktApiBaseUrl') || DEFAULT_POKT_SERVICE_BASE_URL;
    return normalizeBaseUrl(url);
}
/** Painel e links gerais (Railway), exceto compra de token — ver getTokenPurchaseUrl(). */
export function getProPortalBaseUrl() {
    const fromEnv = readEnvFirst(env.proPortalUrl);
    const url = fromEnv || config.get('controllerBaseUrl') || DEFAULT_POKT_SERVICE_BASE_URL;
    return normalizeBaseUrl(url);
}
/** Somente comprar token / checkout — Vercel (Controller). Usado por `pokt pro`. */
export function getTokenPurchaseUrl() {
    const fromEnv = readEnvFirst(env.tokenPurchaseUrl);
    const url = fromEnv || config.get('tokenPurchaseBaseUrl') || DEFAULT_TOKEN_PURCHASE_BASE_URL;
    return normalizeBaseUrl(url);
}
/** @deprecated Use getPoktApiBaseUrl() ou getProPortalBaseUrl() conforme o caso. */
export const getControllerBaseUrl = getPoktApiBaseUrl;
/** URL aberta por `pokt pro` (comprar token) — Vercel por padrão. */
export const getProPurchaseUrl = () => getTokenPurchaseUrl();
/** True se o modelo pode ser usado com as credenciais atuais (evita ficar preso em controller sem token Pokt). */
export function isModelCredentialReady(model) {
    switch (model.provider) {
        case 'controller':
            return !!getPoktToken();
        case 'openai':
            return !!getOpenAIApiKey();
        case 'grok':
            return !!getGrokApiKey();
        case 'openrouter':
            return !!getOpenRouterToken();
        case 'gemini':
            return !!getGeminiApiKey();
        case 'ollama-cloud':
            return !!getOllamaCloudApiKey();
        case 'ollama':
            return true;
        default:
            return false;
    }
}
/** Prioridade: modelo ativo explícito (se credenciais OK) → Pokt (controller) se token setado → OpenRouter → Gemini → Ollama Cloud → Ollama local */
export function getEffectiveActiveModel() {
    const explicit = config.get('activeModel');
    if (explicit && isModelCredentialReady(explicit))
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
    const anyUsable = models.find((m) => isModelCredentialReady(m));
    return anyUsable ?? null;
}
