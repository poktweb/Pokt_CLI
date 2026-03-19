import type { McpServerConfig } from '../config.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions.js';
export interface McpToolDef {
    serverName: string;
    name: string;
    /** Nome exposto ao LLM (com prefixo para evitar colisão) */
    exposedName: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
type McpTransport = {
    close?: () => void | Promise<void>;
    sessionId?: string;
    setProtocolVersion?: (v: string) => void;
};
export interface McpClientSession {
    serverName: string;
    client: {
        listTools: () => Promise<{
            tools: Array<{
                name: string;
                description?: string;
                inputSchema?: Record<string, unknown>;
            }>;
        }>;
        callTool: (params: {
            name: string;
            arguments?: Record<string, unknown>;
        }) => Promise<{
            content: Array<{
                type?: string;
                text?: string;
            }>;
        }>;
    };
    tools: McpToolDef[];
    transport?: McpTransport;
}
export declare function mcpToolToOpenAI(t: McpToolDef): ChatCompletionTool;
/**
 * Conecta a um servidor MCP (stdio, HTTP ou HTTP+OAuth).
 */
export declare function connectMcpServer(serverConfig: McpServerConfig): Promise<McpClientSession | null>;
/**
 * Desconecta todos os clientes MCP.
 */
export declare function disconnectAllMcp(): Promise<void>;
/**
 * Retorna todas as tools MCP de todas as sessões ativas em formato OpenAI.
 */
export declare function getAllMcpToolsOpenAI(): ChatCompletionTool[];
/**
 * Executa uma tool pelo nome exposto (mcp_<server>_<tool>). Retorna o resultado em string.
 */
export declare function callMcpTool(exposedName: string, argsStr: string): Promise<string>;
/**
 * Verifica se um nome de tool é de MCP (deve ser roteado ao cliente MCP).
 */
export declare function isMcpTool(name: string): boolean;
/** Nomes expostos de todas as tools MCP conectadas (ex.: mcp_Neon_run_sql). */
export declare function getMcpExposedToolNames(): string[];
/** Chaves de propriedades do schema de entrada da tool (para montar JSON a partir de string solta). */
export declare function getMcpToolParameterKeys(exposedName: string): string[];
export {};
