import Conf from 'conf';
export type Provider = 'openrouter' | 'ollama' | 'ollama-cloud' | 'gemini' | 'controller';
export declare const PROVIDER_LABELS: Record<Provider, string>;
/** Lista de todos os provedores disponíveis (único lugar para incluir novos no futuro) */
export declare const ALL_PROVIDERS: readonly Provider[];
export interface ModelConfig {
    provider: Provider;
    id: string;
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
export declare const config: Conf<AppConfig>;
export declare const getControllerBaseUrl: () => string;
/** Página inicial do Pokt Pro (aí tem o botão de assinatura/pagamento). */
export declare const getProPurchaseUrl: () => string;
/** Prioridade: modelo ativo explícito → Pokt (controller) se token setado → OpenRouter → Gemini → Ollama Cloud → Ollama local */
export declare function getEffectiveActiveModel(): ModelConfig | null;
export {};
