import type { McpServerConfig } from '../config.js';
import type OpenAI from 'openai';
export interface McpToolDef {
    serverName: string;
    name: string;
    /** Nome exposto ao LLM (com prefixo para evitar colisão) */
    exposedName: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
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
    transport?: {
        close?: () => void;
    };
}
/**
 * Converte tool MCP para formato OpenAI ChatCompletionTool.
 */
export declare function mcpToolToOpenAI(t: McpToolDef): OpenAI.Chat.Completions.ChatCompletionTool;
/**
 * Conecta a um servidor MCP (stdio) e retorna a sessão com tools listados.
 */
export declare function connectMcpServer(serverConfig: McpServerConfig): Promise<McpClientSession | null>;
/**
 * Desconecta todos os clientes MCP.
 */
export declare function disconnectAllMcp(): Promise<void>;
/**
 * Retorna todas as tools MCP de todas as sessões ativas em formato OpenAI.
 */
export declare function getAllMcpToolsOpenAI(): OpenAI.Chat.Completions.ChatCompletionTool[];
/**
 * Executa uma tool pelo nome exposto (mcp_<server>_<tool>). Retorna o resultado em string.
 */
export declare function callMcpTool(exposedName: string, argsStr: string): Promise<string>;
/**
 * Verifica se um nome de tool é de MCP (deve ser roteado ao cliente MCP).
 */
export declare function isMcpTool(name: string): boolean;
