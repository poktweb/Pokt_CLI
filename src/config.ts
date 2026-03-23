import Conf from 'conf';
import { randomUUID } from 'crypto';
import os from 'os';

export type Provider =
  | 'openai'
  | 'grok'
  | 'openrouter'
  | 'ollama'
  | 'ollama-cloud'
  | 'gemini'
  | 'controller';

export const PROVIDER_LABELS: Record<Provider, string> = {
  controller: 'Pokt API (Controller)',
  openai: 'OpenAI',
  grok: 'Grok (xAI)',
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
  ollama: 'Ollama (local)',
  'ollama-cloud': 'Ollama Cloud'
};

/** Lista de todos os provedores disponíveis (único lugar para incluir novos no futuro) */
export const ALL_PROVIDERS: readonly Provider[] = (Object.keys(PROVIDER_LABELS) as Provider[]);

export interface ModelConfig {
  provider: Provider;
  id: string;
}

/** Serviço Pokt na Railway: API (`/api/v1`), painel e tudo que substituiu o host antigo da Vercel. */
const DEFAULT_POKT_SERVICE_BASE_URL = 'https://poktcliback-production.up.railway.app';

/** Somente fluxo de compra de token (Stripe / “Torne-se Pro”) — permanece no Controller Vercel. */
const DEFAULT_TOKEN_PURCHASE_BASE_URL = 'https://pokt-cli-controller.vercel.app';

/** Host legado: configs antigas são migradas automaticamente para `DEFAULT_POKT_SERVICE_BASE_URL`. */
const LEGACY_VERCEL_POKT_HOST = 'pokt-cli-controller.vercel.app';

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function isLegacyVercelPoktUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.hostname.toLowerCase() === LEGACY_VERCEL_POKT_HOST;
  } catch {
    return false;
  }
}

export interface McpServerConfig {
  name: string;
  type: 'stdio' | 'http';
  /** Para stdio: comando a executar (ex: "npx", "node") */
  command?: string;
  /** Para stdio: argumentos (ex: ["-y", "mcp-server-filesystem"]) */
  args?: string[];
  /** Para http: URL do servidor MCP (Streamable HTTP ou SSE) */
  url?: string;
  /** HTTP: transporte (padrão streamable-http). Use "sse" para servidores legados. */
  httpTransport?: 'streamable-http' | 'sse';
  /** HTTP: cabeçalhos extras (ex. Authorization). Valores podem usar ${VAR} de ambiente. */
  headers?: Record<string, string>;
  /** stdio/http: variáveis de ambiente adicionais para o processo ou referência futura */
  env?: Record<string, string>;
  /** HTTP: abre fluxo OAuth no navegador e grava tokens em pokt_cli/.mcp-oauth/ */
  oauth?: boolean;
  /** Origem da entrada: projeto (mcp.json) ou global (config do Pokt) */
  source?: 'project' | 'global';
}

interface AppConfig {
  openaiApiKey: string;
  grokApiKey: string;
  openrouterToken: string;
  geminiApiKey: string;
  ollamaBaseUrl: string;
  ollamaCloudApiKey: string;
  /** Painel / links gerais (Railway); não usar para compra de token */
  controllerBaseUrl: string;
  /** Base para API com token Pokt — provider `controller` (Railway) */
  poktApiBaseUrl: string;
  /** Só compra de token / checkout — Vercel */
  tokenPurchaseBaseUrl: string;
  poktToken: string;
  /** ID estável por instalação (telemetria de uso no Back) */
  cliInstallId: string;
  registeredModels: ModelConfig[];
  activeModel: ModelConfig | null;
  mcpServers: McpServerConfig[];
}

export const config = new Conf<AppConfig>({
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

function readEnvFirst(envNames: readonly string[]): string {
  for (const n of envNames) {
    const v = process.env[n];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

export const env = {
  openaiApiKey: ['OPENAI_API_KEY'] as const,
  grokApiKey: ['XAI_API_KEY', 'GROK_API_KEY'] as const,
  openrouterToken: ['OPENROUTER_API_KEY', 'OPENROUTER_TOKEN'] as const,
  geminiApiKey: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] as const,
  ollamaBaseUrl: ['OLLAMA_BASE_URL'] as const,
  ollamaCloudApiKey: ['OLLAMA_CLOUD_API_KEY'] as const,
  poktToken: ['POKT_TOKEN'] as const,
  disableTelemetry: ['POKT_DISABLE_TELEMETRY'] as const,
  poktApiBaseUrl: ['POKT_API_BASE_URL'] as const,
  /** Painel e URLs gerais (Railway) */
  proPortalUrl: ['POKT_PRO_PORTAL_URL', 'POKT_CONTROLLER_PORTAL_URL'] as const,
  /** Apenas página de compra de token (Vercel) */
  tokenPurchaseUrl: ['POKT_TOKEN_PURCHASE_URL'] as const,
} as const;

/**
 * Migração: quem tinha a URL antiga da Vercel em API ou portal passa a usar a Railway.
 * A URL de compra de token não é alterada aqui.
 */
function migrateLegacyPoktUrls(): void {
  const target = DEFAULT_POKT_SERVICE_BASE_URL;
  for (const key of ['poktApiBaseUrl', 'controllerBaseUrl'] as const) {
    const val = config.get(key);
    if (typeof val === 'string' && val.trim() !== '' && isLegacyVercelPoktUrl(val)) {
      config.set(key, target);
    }
  }
}

migrateLegacyPoktUrls();

export function getOpenAIApiKey(): string {
  return readEnvFirst(env.openaiApiKey) || config.get('openaiApiKey') || '';
}
export function getGrokApiKey(): string {
  return readEnvFirst(env.grokApiKey) || config.get('grokApiKey') || '';
}
export function getOpenRouterToken(): string {
  return readEnvFirst(env.openrouterToken) || config.get('openrouterToken') || '';
}
export function getGeminiApiKey(): string {
  return readEnvFirst(env.geminiApiKey) || config.get('geminiApiKey') || '';
}
export function getOllamaBaseUrl(): string {
  const fromEnv = readEnvFirst(env.ollamaBaseUrl);
  const url = (fromEnv || config.get('ollamaBaseUrl') || 'http://localhost:11434').replace(/\/$/, '');
  return url;
}
export function getOllamaCloudApiKey(): string {
  return readEnvFirst(env.ollamaCloudApiKey) || config.get('ollamaCloudApiKey') || '';
}
export function getPoktToken(): string {
  return readEnvFirst(env.poktToken) || config.get('poktToken') || '';
}

/** UUID persistente por máquina/instalação (identifica uso no painel quando não há token Pokt). */
export function getOrCreateCliInstallId(): string {
  let id = config.get('cliInstallId');
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = randomUUID();
    config.set('cliInstallId', id);
  }
  return id;
}

/** Nome do PC (sanitizado) para exibição no log de uso. */
export function getCliHostLabel(): string {
  try {
    const h = os.hostname().replace(/[^\w.-]+/g, '_').slice(0, 120);
    return h || 'PC';
  } catch {
    return 'PC';
  }
}

export function isCliTelemetryDisabled(): boolean {
  const v = readEnvFirst(env.disableTelemetry);
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

/** Base da API só para provider `controller` (Bearer Pokt). OpenAI direto usa outro ramo no getClient. */
export function getPoktApiBaseUrl(): string {
  const fromEnv = readEnvFirst(env.poktApiBaseUrl);
  const url = fromEnv || config.get('poktApiBaseUrl') || DEFAULT_POKT_SERVICE_BASE_URL;
  return normalizeBaseUrl(url);
}

/** Painel e links gerais (Railway), exceto compra de token — ver getTokenPurchaseUrl(). */
export function getProPortalBaseUrl(): string {
  const fromEnv = readEnvFirst(env.proPortalUrl);
  const url = fromEnv || config.get('controllerBaseUrl') || DEFAULT_POKT_SERVICE_BASE_URL;
  return normalizeBaseUrl(url);
}

/** Somente comprar token / checkout — Vercel (Controller). Usado por `pokt pro`. */
export function getTokenPurchaseUrl(): string {
  const fromEnv = readEnvFirst(env.tokenPurchaseUrl);
  const url = fromEnv || config.get('tokenPurchaseBaseUrl') || DEFAULT_TOKEN_PURCHASE_BASE_URL;
  return normalizeBaseUrl(url);
}

/** @deprecated Use getPoktApiBaseUrl() ou getProPortalBaseUrl() conforme o caso. */
export const getControllerBaseUrl = getPoktApiBaseUrl;

/** URL aberta por `pokt pro` (comprar token) — Vercel por padrão. */
export const getProPurchaseUrl = (): string => getTokenPurchaseUrl();

/** True se o modelo pode ser usado com as credenciais atuais (evita ficar preso em controller sem token Pokt). */
export function isModelCredentialReady(model: ModelConfig): boolean {
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
export function getEffectiveActiveModel(): ModelConfig | null {
  const explicit = config.get('activeModel');
  if (explicit && isModelCredentialReady(explicit)) return explicit;

  const models = config.get('registeredModels');
  if (getPoktToken()) {
    const c = models.find((m: ModelConfig) => m.provider === 'controller');
    if (c) return c;
  }
  if (getOpenAIApiKey()) {
    const oa = models.find((m: ModelConfig) => m.provider === 'openai');
    if (oa) return oa;
  }
  if (getGrokApiKey()) {
    const gx = models.find((m: ModelConfig) => m.provider === 'grok');
    if (gx) return gx;
  }
  if (getOpenRouterToken()) {
    const o = models.find((m: ModelConfig) => m.provider === 'openrouter');
    if (o) return o;
  }
  if (getGeminiApiKey()) {
    const g = models.find((m: ModelConfig) => m.provider === 'gemini');
    if (g) return g;
  }
  if (getOllamaCloudApiKey()) {
    const oc = models.find((m: ModelConfig) => m.provider === 'ollama-cloud');
    if (oc) return oc;
  }
  const ollama = models.find((m: ModelConfig) => m.provider === 'ollama');
  if (ollama) return ollama;

  const anyUsable = models.find((m: ModelConfig) => isModelCredentialReady(m));
  return anyUsable ?? null;
}
