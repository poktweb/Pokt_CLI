import Conf from 'conf';

export type Provider = 'openrouter' | 'ollama' | 'gemini';

export interface ModelConfig {
  provider: Provider;
  id: string;
}

interface AppConfig {
  openrouterToken: string;
  geminiApiKey: string;
  googleToken: any; // OAuth token object
  googleClientId: string;
  googleClientSecret: string;
  ollamaBaseUrl: string;
  registeredModels: ModelConfig[];
  activeModel: ModelConfig | null;
}

export const config = new Conf<AppConfig>({
  projectName: 'pokt-cli',
  defaults: {
    openrouterToken: '',
    geminiApiKey: '',
    googleToken: null,
    googleClientId: '',
    googleClientSecret: '',
    ollamaBaseUrl: 'http://localhost:11434',
    registeredModels: [
      { provider: 'openrouter', id: 'google/gemini-2.0-flash-001' },
      { provider: 'openrouter', id: 'anthropic/claude-3.5-sonnet' },
      { provider: 'gemini', id: 'gemini-1.5-flash' },
      { provider: 'gemini', id: 'gemini-1.5-pro' }
    ],
    activeModel: null,
  }
});
