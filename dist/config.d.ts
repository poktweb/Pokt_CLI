import Conf from 'conf';
export type Provider = 'openrouter' | 'ollama' | 'gemini';
export interface ModelConfig {
    provider: Provider;
    id: string;
}
interface AppConfig {
    openrouterToken: string;
    geminiApiKey: string;
    ollamaBaseUrl: string;
    registeredModels: ModelConfig[];
    activeModel: ModelConfig | null;
}
export declare const config: Conf<AppConfig>;
export {};
