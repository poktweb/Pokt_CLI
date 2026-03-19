import Conf from 'conf';

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

const DEFAULT_CONTROLLER_URL = 'https://pokt-cli-controller.vercel.app';

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
  controllerBaseUrl: string;
  poktToken: string;
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
} as const;

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

export const getControllerBaseUrl = (): string => {
  const url = config.get('controllerBaseUrl') || DEFAULT_CONTROLLER_URL;
  return url.replace(/\/$/, '');
};

/** Página inicial do Pokt Pro (aí tem o botão de assinatura/pagamento). */
export const getProPurchaseUrl = (): string => getControllerBaseUrl();

/** Prioridade: modelo ativo explícito → Pokt (controller) se token setado → OpenRouter → Gemini → Ollama Cloud → Ollama local */
export function getEffectiveActiveModel(): ModelConfig | null {
  const explicit = config.get('activeModel');
  if (explicit) return explicit;

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

  return models[0] ?? null;
}
