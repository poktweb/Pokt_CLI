/**
 * Descobre a pasta pokt_cli (variações de nome) na raiz do projeto e lê mcp.json.
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
/** Nomes aceitos para a pasta (comparação case-insensitive). Inclui Pot_cli → pot_cli. */
const ACCEPT_DIR_NAMES_LOWER = new Set(['pokt_cli', 'pot_cli']);
export function isPoktCliDirName(name) {
    return ACCEPT_DIR_NAMES_LOWER.has(name.trim().toLowerCase());
}
/**
 * Sobe diretórios a partir de startDir até a raiz do volume e retorna o primeiro
 * diretório que contém uma pasta pokt_cli / Pot_cli / etc.
 */
export function findPoktCliFolder(startDir) {
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;
    while (true) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const ent of entries) {
                if (ent.isDirectory() && isPoktCliDirName(ent.name)) {
                    return path.join(dir, ent.name);
                }
            }
        }
        catch {
            /* ignore */
        }
        if (dir === root)
            break;
        dir = path.dirname(dir);
    }
    return null;
}
/** Substitui ${VAR} pelo valor de process.env.VAR (vazio se não existir). */
export function expandEnvVarsInString(s) {
    return s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => process.env[key] ?? '');
}
function expandEnvVarsInRecord(r) {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
        out[k] = expandEnvVarsInString(v);
    }
    return out;
}
function recordFromUnknownEnv(obj) {
    if (!obj || typeof obj !== 'object')
        return undefined;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            out[k] = String(v);
        }
    }
    return Object.keys(out).length ? out : undefined;
}
/**
 * Extrai o mapa de servidores de um mcp.json (vários formatos comuns).
 */
function getServerEntriesMap(raw) {
    if ('mcpServers' in raw && raw.mcpServers && typeof raw.mcpServers === 'object') {
        return raw.mcpServers;
    }
    if ('servers' in raw && raw.servers && typeof raw.servers === 'object') {
        return raw.servers;
    }
    if ('mcp' in raw && raw.mcp && typeof raw.mcp === 'object') {
        const mcp = raw.mcp;
        if (mcp.servers && typeof mcp.servers === 'object') {
            return mcp.servers;
        }
        if (mcp.mcpServers && typeof mcp.mcpServers === 'object') {
            return mcp.mcpServers;
        }
    }
    return null;
}
/**
 * Converte uma entrada no estilo Cursor / Claude Desktop / Neon (mcp.json) para McpServerConfig.
 */
export function mcpJsonEntryToConfig(name, entry) {
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    const command = typeof entry.command === 'string' ? entry.command.trim() : '';
    const args = Array.isArray(entry.args) ? entry.args.map((a) => String(a)) : [];
    const env = recordFromUnknownEnv(entry.env);
    const envExpanded = env ? expandEnvVarsInRecord(env) : undefined;
    const headersRaw = recordFromUnknownEnv(entry.headers);
    const headers = headersRaw ? expandEnvVarsInRecord(headersRaw) : undefined;
    const transportRaw = typeof entry.transport === 'string' ? entry.transport.toLowerCase().trim() : '';
    const httpTransport = transportRaw === 'sse' ? 'sse' : 'streamable-http';
    const oauth = entry.oauth === true;
    if (url) {
        return {
            name,
            type: 'http',
            url,
            httpTransport,
            headers,
            env: envExpanded,
            oauth,
            source: 'project',
        };
    }
    if (command) {
        return {
            name,
            type: 'stdio',
            command,
            args,
            env: envExpanded,
            source: 'project',
        };
    }
    return null;
}
/**
 * Lê <poktDir>/mcp.json e retorna servidores (vazio se arquivo inválido ou ausente).
 */
export function loadProjectMcpJson(poktDir) {
    const mcpJsonPath = path.join(poktDir, 'mcp.json');
    if (!fs.existsSync(mcpJsonPath)) {
        return { servers: [], mcpJsonPath, poktDir };
    }
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
    }
    catch {
        return { servers: [], mcpJsonPath, poktDir };
    }
    const servers = [];
    if (raw && typeof raw === 'object') {
        const ms = getServerEntriesMap(raw);
        if (ms) {
            for (const [name, entry] of Object.entries(ms)) {
                if (entry && typeof entry === 'object') {
                    const c = mcpJsonEntryToConfig(name, entry);
                    if (c)
                        servers.push(c);
                }
            }
        }
    }
    return { servers, mcpJsonPath, poktDir };
}
/**
 * Mescla config global do Pokt com servidores do projeto: mesmo `name` → o do projeto sobrescreve.
 */
export function mergeMcpConfigs(globalServers, projectServers) {
    const map = new Map();
    for (const g of globalServers) {
        map.set(g.name, { ...g, source: g.source ?? 'global' });
    }
    for (const p of projectServers) {
        map.set(p.name, { ...p, source: 'project' });
    }
    return [...map.values()];
}
const MCP_JSON_TEMPLATE = `{
  "mcpServers": {
    "meu-servidor-local": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": {}
    },
    "meu-servidor-http": {
      "url": "https://seu-host/mcp",
      "transport": "streamable-http",
      "oauth": true
    },
    "api-com-token-estatico": {
      "url": "https://outro-host/mcp",
      "transport": "streamable-http",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer \${MEU_TOKEN_ENV}"
      }
    }
  }
}
`;
/** Cria ./pokt_cli/mcp.json no diretório indicado (não sobrescreve se já existir). Retorna o caminho ou null. */
export function initProjectMcpJson(projectRootDir) {
    const poktDir = path.join(path.resolve(projectRootDir), 'pokt_cli');
    const mcpPath = path.join(poktDir, 'mcp.json');
    if (!fs.existsSync(poktDir)) {
        fs.mkdirSync(poktDir, { recursive: true });
    }
    if (fs.existsSync(mcpPath)) {
        return { created: false, path: mcpPath, poktDir };
    }
    fs.writeFileSync(mcpPath, MCP_JSON_TEMPLATE.trimStart(), 'utf8');
    return { created: true, path: mcpPath, poktDir };
}
/** Servidores MCP efetivos: globais do usuário + mcp.json do projeto (projeto sobrescreve por nome). */
export function getMergedMcpServers(cwd = process.cwd()) {
    const poktDir = findPoktCliFolder(cwd);
    const loaded = poktDir ? loadProjectMcpJson(poktDir) : null;
    const project = loaded?.servers ?? [];
    const globalServers = config.get('mcpServers') ?? [];
    return {
        merged: mergeMcpConfigs(globalServers, project),
        poktDir,
        mcpJsonPath: loaded?.mcpJsonPath ?? null,
    };
}
