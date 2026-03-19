/**
 * Remove blocos ```bash``` que são só invocações MCP (às vezes `mcp_*` numa linha e JSON na seguinte).
 */
export declare function stripExecutedStyleMcpBashBlocks(content: string): string;
/** Uma linha tipo: mcp_Neon_run_sql "SELECT 1" ou mcp_Neon_list_projects */
export declare function parseMcpShellLine(line: string): {
    tool: string;
    args: string;
} | null;
export declare function runMcpFromBashMarkdown(content: string, options?: {
    skipDuplicateAppendix?: boolean;
}): Promise<{
    invocationCount: number;
    executedCount: number;
    augmentedAssistantText: string;
}>;
/**
 * Quando o modelo devolve vazio e o pedido parece “listar bancos”, executa mcp_*_run_sql uma vez.
 */
export declare function tryAutoMcpForListDatabases(messages: Array<{
    role: string;
    content?: unknown;
}>): Promise<string | null>;
