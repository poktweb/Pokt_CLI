/**
 * Cliente MCP (Model Context Protocol): stdio, HTTP (Streamable HTTP / SSE) e OAuth opcional.
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import { findPoktCliFolder } from './project-mcp.js';
import { ui } from '../ui.js';
import { FileBackedOAuthClientProvider, startOAuthCallbackServer, defaultMcpOAuthClientMetadata, openAuthorizationInBrowser, } from './oauth-provider.js';
const require = createRequire(import.meta.url);
// Não usar require.resolve('.../package.json'): o exports "./*" do SDK aponta para dist/cjs/*,
// então o dirname viraria .../dist/cjs e dist/esm/... viraria dist/cjs/dist/esm/... (ERR_MODULE_NOT_FOUND).
const sdkPath = path.resolve(path.dirname(require.resolve('@modelcontextprotocol/sdk/client')), '..', '..', '..');
const stdioModulePath = pathToFileURL(path.join(sdkPath, 'dist/esm/client/stdio.js')).href;
const streamableHttpPath = pathToFileURL(path.join(sdkPath, 'dist/esm/client/streamableHttp.js')).href;
const sseModulePath = pathToFileURL(path.join(sdkPath, 'dist/esm/client/sse.js')).href;
const authModulePath = pathToFileURL(path.join(sdkPath, 'dist/esm/client/auth.js')).href;
const MCP_PREFIX = 'mcp_';
let sessions = [];
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
function mergeProcessEnv(extra) {
    return { ...process.env, ...extra };
}
async function buildToolsFromClient(serverConfig, client) {
    const list = await client.listTools();
    return (list.tools ?? []).map((t) => ({
        serverName: serverConfig.name,
        name: t.name,
        exposedName: `${MCP_PREFIX}${serverConfig.name}_${t.name}`.replace(/\s+/g, '_'),
        description: t.description ?? `MCP tool: ${t.name}`,
        inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
    }));
}
function pushSession(serverConfig, client, tools, transport) {
    const session = {
        serverName: serverConfig.name,
        client,
        tools,
        transport,
    };
    sessions.push(session);
    return session;
}
/**
 * Conecta a um servidor MCP (stdio, HTTP ou HTTP+OAuth).
 */
export async function connectMcpServer(serverConfig) {
    try {
        if (serverConfig.type === 'stdio' && serverConfig.command) {
            return await connectMcpStdio(serverConfig);
        }
        if (serverConfig.type === 'http' && serverConfig.url) {
            return await connectMcpHttp(serverConfig);
        }
        return null;
    }
    catch (err) {
        console.error(`[MCP] Failed to connect to ${serverConfig.name}:`, err);
        return null;
    }
}
async function connectMcpStdio(serverConfig) {
    const { Client } = await import('@modelcontextprotocol/sdk/client');
    const { StdioClientTransport } = await import(stdioModulePath);
    const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args ?? [],
        env: mergeProcessEnv(serverConfig.env),
    });
    const client = new Client({ name: 'pokt-cli', version: '1.0.13' });
    await client.connect(transport);
    const tools = await buildToolsFromClient(serverConfig, client);
    return pushSession(serverConfig, client, tools, transport);
}
async function connectMcpHttp(serverConfig) {
    const { Client } = await import('@modelcontextprotocol/sdk/client');
    const { UnauthorizedError } = await import(authModulePath);
    const isUnauthorized = (e) => e instanceof UnauthorizedError ||
        (typeof e === 'object' &&
            e !== null &&
            'name' in e &&
            e.name === 'UnauthorizedError');
    const url = new URL(serverConfig.url);
    const useSse = serverConfig.httpTransport === 'sse';
    const headers = serverConfig.headers;
    if (serverConfig.oauth) {
        const poktDir = findPoktCliFolder(process.cwd());
        if (!poktDir) {
            console.error(`[MCP] Servidor "${serverConfig.name}" usa OAuth, mas não foi encontrada a pasta pokt_cli na raiz do projeto. Crie pokt_cli/mcp.json na raiz.`);
            return null;
        }
        const cb = await startOAuthCallbackServer();
        const redirectUrl = cb.redirectUrl;
        const metadata = defaultMcpOAuthClientMetadata(redirectUrl);
        const authProvider = new FileBackedOAuthClientProvider(redirectUrl, metadata, (authUrl) => {
            openAuthorizationInBrowser(authUrl);
            console.error(`[MCP] Autorize "${serverConfig.name}" no navegador (URL aberta automaticamente).`);
        }, poktDir, serverConfig.name);
        const makeTransport = async () => {
            if (useSse) {
                return makeSseTransport(url, { authProvider, headers });
            }
            return makeStreamableTransport(url, { authProvider, headers });
        };
        const client = new Client({ name: 'pokt-cli', version: '1.0.13' });
        let transport = await makeTransport();
        const cleanupCb = async () => {
            try {
                await cb.close();
            }
            catch {
                /* ignore */
            }
        };
        try {
            try {
                await client.connect(transport);
            }
            catch (e) {
                if (isUnauthorized(e)) {
                    const code = await cb.waitForCode;
                    await transport.finishAuth(code);
                    await Promise.resolve(transport.close()).catch(() => { });
                    transport = await makeTransport();
                    await client.connect(transport);
                }
                else {
                    await cleanupCb();
                    throw e;
                }
            }
            await cleanupCb();
        }
        catch (e) {
            await cleanupCb();
            throw e;
        }
        const tools = await buildToolsFromClient(serverConfig, client);
        return pushSession(serverConfig, client, tools, transport);
    }
    const transport = useSse
        ? await makeSseTransport(url, { headers })
        : await makeStreamableTransport(url, { headers });
    const client = new Client({ name: 'pokt-cli', version: '1.0.13' });
    await client.connect(transport);
    const tools = await buildToolsFromClient(serverConfig, client);
    return pushSession(serverConfig, client, tools, transport);
}
async function makeStreamableTransport(url, opts) {
    const mod = await import(streamableHttpPath);
    const Ctor = mod.StreamableHTTPClientTransport;
    const requestInit = opts.headers && Object.keys(opts.headers).length > 0 ? { headers: opts.headers } : undefined;
    return new Ctor(url, {
        authProvider: opts.authProvider,
        requestInit,
    });
}
async function makeSseTransport(url, opts) {
    const mod = await import(sseModulePath);
    const Ctor = mod.SSEClientTransport;
    const requestInit = opts.headers && Object.keys(opts.headers).length > 0 ? { headers: opts.headers } : undefined;
    return new Ctor(url, {
        authProvider: opts.authProvider,
        requestInit,
    });
}
/**
 * Desconecta todos os clientes MCP.
 */
export async function disconnectAllMcp() {
    await Promise.all(sessions.map(async (s) => {
        try {
            const c = s.transport?.close?.();
            if (c && typeof c.then === 'function')
                await c;
        }
        catch {
            /* ignore */
        }
    }));
    sessions = [];
}
function mcpToolResultToText(result) {
    const content = result.content;
    if (Array.isArray(content)) {
        return content
            .map((c) => c.type === 'text' && typeof c.text === 'string' ? c.text : JSON.stringify(c))
            .join('\n');
    }
    return typeof content === 'string' ? content : JSON.stringify(content);
}
function getJsonSchemaRequiredKeys(schema) {
    const req = schema.required;
    if (!Array.isArray(req))
        return [];
    return req.filter((x) => typeof x === 'string');
}
/**
 * Resposta típica do Neon MCP `list_projects`: `{ projects: [{ id, ... }] }` ou lista simples.
 */
function extractNeonProjectIdsFromListProjectsPayload(raw) {
    const t = raw.trim();
    if (!t)
        return [];
    try {
        const data = JSON.parse(t);
        if (Array.isArray(data)) {
            return data.map((p) => (p && typeof p === 'object' && 'id' in p ? String(p.id) : '')).filter(Boolean);
        }
        if (data && typeof data === 'object' && 'projects' in data) {
            const projects = data.projects;
            if (Array.isArray(projects)) {
                return projects
                    .map((p) => (p && typeof p === 'object' && 'id' in p ? String(p.id) : ''))
                    .filter(Boolean);
            }
        }
    }
    catch {
        /* ignore */
    }
    return [];
}
/**
 * Neon: várias tools exigem `projectId`. Se vier vazio e a conta tiver **um** projeto, injeta o id via `list_projects`.
 */
async function ensureNeonProjectIdArg(session, tool, args) {
    const skipTools = new Set(['list_projects', 'list_organizations', 'list_shared_projects']);
    if (skipTools.has(tool.name))
        return args;
    const schema = tool.inputSchema;
    if (!schema || typeof schema !== 'object')
        return args;
    const required = getJsonSchemaRequiredKeys(schema);
    if (!required.includes('projectId'))
        return args;
    const existing = args.projectId;
    if (typeof existing === 'string' && existing.trim())
        return args;
    const listTool = session.tools.find((t) => t.name === 'list_projects');
    if (!listTool)
        return args;
    try {
        const listRes = await session.client.callTool({ name: listTool.name, arguments: {} });
        const text = mcpToolResultToText(listRes);
        const ids = extractNeonProjectIdsFromListProjectsPayload(text);
        if (ids.length === 1) {
            const id = ids[0];
            console.log(ui.dim(`[MCP] projectId ausente — usando único projeto Neon: ${id}`));
            return { ...args, projectId: id };
        }
    }
    catch {
        /* deixa o servidor validar */
    }
    return args;
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
    const session = sessions.find((s) => s.tools.some((t) => t.exposedName === exposedName));
    const tool = session?.tools.find((t) => t.exposedName === exposedName);
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
        args = await ensureNeonProjectIdArg(session, tool, args);
        const result = await session.client.callTool({ name: tool.name, arguments: args });
        return mcpToolResultToText(result);
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
/** Nomes expostos de todas as tools MCP conectadas (ex.: mcp_Neon_run_sql). */
export function getMcpExposedToolNames() {
    const out = [];
    for (const s of sessions) {
        for (const t of s.tools) {
            out.push(t.exposedName);
        }
    }
    return out;
}
/** Chaves de propriedades do schema de entrada da tool (para montar JSON a partir de string solta). */
export function getMcpToolParameterKeys(exposedName) {
    for (const s of sessions) {
        const tool = s.tools.find((t) => t.exposedName === exposedName);
        if (!tool?.inputSchema || typeof tool.inputSchema !== 'object')
            continue;
        const props = tool.inputSchema.properties;
        if (props && typeof props === 'object')
            return Object.keys(props);
    }
    return [];
}
