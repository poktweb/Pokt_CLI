/**
 * Cliente MCP (Model Context Protocol) para conectar a servidores MCP
 * e expor tools como funções disponíveis no chat.
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sdkPath = path.dirname(require.resolve('@modelcontextprotocol/sdk/package.json'));
const stdioModulePath = pathToFileURL(path.join(sdkPath, 'dist/esm/client/stdio.js')).href;
const MCP_PREFIX = 'mcp_';
let sessions = [];
/**
 * Converte tool MCP para formato OpenAI ChatCompletionTool.
 */
export function mcpToolToOpenAI(t) {
    const params = t.inputSchema?.type === 'object' ? t.inputSchema : { type: 'object', properties: t.inputSchema ?? {} };
    return {
        type: 'function',
        function: {
            name: t.exposedName,
            description: t.description,
            parameters: params,
        },
    };
}
/**
 * Conecta a um servidor MCP (stdio) e retorna a sessão com tools listados.
 */
export async function connectMcpServer(serverConfig) {
    try {
        const { Client } = await import('@modelcontextprotocol/sdk/client');
        const { StdioClientTransport } = await import(stdioModulePath);
        if (serverConfig.type !== 'stdio' || !serverConfig.command) {
            return null;
        }
        const transport = new StdioClientTransport({
            command: serverConfig.command,
            args: serverConfig.args ?? [],
            env: process.env,
        });
        const client = new Client({ name: 'pokt-cli', version: '1.0.5' });
        await client.connect(transport);
        const list = await client.listTools();
        const tools = (list.tools ?? []).map((t) => ({
            serverName: serverConfig.name,
            name: t.name,
            exposedName: `${MCP_PREFIX}${serverConfig.name}_${t.name}`.replace(/\s+/g, '_'),
            description: t.description ?? `MCP tool: ${t.name}`,
            inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
        }));
        const session = {
            serverName: serverConfig.name,
            client: client,
            tools,
            transport: transport,
        };
        sessions.push(session);
        return session;
    }
    catch (err) {
        console.error(`[MCP] Failed to connect to ${serverConfig.name}:`, err);
        return null;
    }
}
/**
 * Desconecta todos os clientes MCP.
 */
export async function disconnectAllMcp() {
    for (const s of sessions) {
        try {
            if (s.transport?.close)
                s.transport.close();
        }
        catch (_) { }
    }
    sessions = [];
}
/**
 * Retorna todas as tools MCP de todas as sessões ativas em formato OpenAI.
 */
export function getAllMcpToolsOpenAI() {
    const out = [];
    for (const s of sessions) {
        for (const t of s.tools) {
            out.push(mcpToolToOpenAI(t));
        }
    }
    return out;
}
/**
 * Executa uma tool pelo nome exposto (mcp_<server>_<tool>). Retorna o resultado em string.
 */
export async function callMcpTool(exposedName, argsStr) {
    if (!exposedName.startsWith(MCP_PREFIX)) {
        return `[MCP] Not an MCP tool: ${exposedName}`;
    }
    const session = sessions.find(s => s.tools.some(t => t.exposedName === exposedName));
    const tool = session?.tools.find(t => t.exposedName === exposedName);
    if (!session || !tool) {
        return `[MCP] Tool not found: ${exposedName}`;
    }
    try {
        let args = {};
        if (argsStr?.trim()) {
            try {
                args = JSON.parse(argsStr);
            }
            catch {
                args = {};
            }
        }
        const result = await session.client.callTool({ name: tool.name, arguments: args });
        const content = result.content;
        if (Array.isArray(content)) {
            return content.map((c) => (c.type === 'text' && typeof c.text === 'string' ? c.text : JSON.stringify(c))).join('\n');
        }
        return typeof content === 'string' ? content : JSON.stringify(content);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `[MCP] Error calling ${exposedName}: ${msg}`;
    }
}
/**
 * Verifica se um nome de tool é de MCP (deve ser roteado ao cliente MCP).
 */
export function isMcpTool(name) {
    return name.startsWith(MCP_PREFIX);
}
