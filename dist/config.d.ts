import Conf from 'conf';
export type Provider = 'openai' | 'grok' | 'openrouter' | 'ollama' | 'ollama-cloud' | 'gemini' | 'controller';
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
    registeredModels: ModelConfig[];
    activeModel: ModelConfig | null;
    mcpServers: McpServerConfig[];
}
export declare const config: Conf<AppConfig>;
export declare const env: {
    readonly openaiApiKey: readonly ["OPENAI_API_KEY"];
    readonly grokApiKey: readonly ["XAI_API_KEY", "GROK_API_KEY"];
    readonly openrouterToken: readonly ["OPENROUTER_API_KEY", "OPENROUTER_TOKEN"];
    readonly geminiApiKey: readonly ["GEMINI_API_KEY", "GOOGLE_API_KEY"];
    readonly ollamaBaseUrl: readonly ["OLLAMA_BASE_URL"];
    readonly ollamaCloudApiKey: readonly ["OLLAMA_CLOUD_API_KEY"];
    readonly poktToken: readonly ["POKT_TOKEN"];
    readonly poktApiBaseUrl: readonly ["POKT_API_BASE_URL"];
    /** Painel e URLs gerais (Railway) */
    readonly proPortalUrl: readonly ["POKT_PRO_PORTAL_URL", "POKT_CONTROLLER_PORTAL_URL"];
    /** Apenas página de compra de token (Vercel) */
    readonly tokenPurchaseUrl: readonly ["POKT_TOKEN_PURCHASE_URL"];
};
export declare function getOpenAIApiKey(): string;
export declare function getGrokApiKey(): string;
export declare function getOpenRouterToken(): string;
export declare function getGeminiApiKey(): string;
export declare function getOllamaBaseUrl(): string;
export declare function getOllamaCloudApiKey(): string;
export declare function getPoktToken(): string;
/** Base da API só para provider `controller` (Bearer Pokt). OpenAI direto usa outro ramo no getClient. */
export declare function getPoktApiBaseUrl(): string;
/** Painel e links gerais (Railway), exceto compra de token — ver getTokenPurchaseUrl(). */
export declare function getProPortalBaseUrl(): string;
/** Somente comprar token / checkout — Vercel (Controller). Usado por `pokt pro`. */
export declare function getTokenPurchaseUrl(): string;
/** @deprecated Use getPoktApiBaseUrl() ou getProPortalBaseUrl() conforme o caso. */
export declare const getControllerBaseUrl: typeof getPoktApiBaseUrl;
/** URL aberta por `pokt pro` (comprar token) — Vercel por padrão. */
export declare const getProPurchaseUrl: () => string;
/** Prioridade: modelo ativo explícito → Pokt (controller) se token setado → OpenRouter → Gemini → Ollama Cloud → Ollama local */
export declare function getEffectiveActiveModel(): ModelConfig | null;
export {};
