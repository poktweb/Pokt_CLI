import Conf from 'conf';

export type Provider = 'openrouter' | 'ollama' | 'ollama-cloud' | 'gemini' | 'controller';

export const PROVIDER_LABELS: Record<Provider, string> = {
  controller: 'Pokt API (Controller)',
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
}

interface AppConfig {
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

export const getControllerBaseUrl = (): string => {
  const url = config.get('controllerBaseUrl') || DEFAULT_CONTROLLER_URL;
  return url.replace(/\/$/, '');
};

/** Prioridade: modelo ativo explícito → Pokt (controller) se token setado → OpenRouter → Gemini → Ollama Cloud → Ollama local */
export function getEffectiveActiveModel(): ModelConfig | null {
  const explicit = config.get('activeModel');
  if (explicit) return explicit;

  const models = config.get('registeredModels');
  if (config.get('poktToken')) {
    const c = models.find((m: ModelConfig) => m.provider === 'controller');
    if (c) return c;
  }
  if (config.get('openrouterToken')) {
    const o = models.find((m: ModelConfig) => m.provider === 'openrouter');
    if (o) return o;
  }
  if (config.get('geminiApiKey')) {
    const g = models.find((m: ModelConfig) => m.provider === 'gemini');
    if (g) return g;
  }
  if (config.get('ollamaCloudApiKey')) {
    const oc = models.find((m: ModelConfig) => m.provider === 'ollama-cloud');
    if (oc) return oc;
  }
  const ollama = models.find((m: ModelConfig) => m.provider === 'ollama');
  if (ollama) return ollama;

  return models[0] ?? null;
}
