import { type McpServerConfig } from '../config.js';
export declare function isPoktCliDirName(name: string): boolean;
/**
 * Sobe diretórios a partir de startDir até a raiz do volume e retorna o primeiro
 * diretório que contém uma pasta pokt_cli / Pot_cli / etc.
 */
export declare function findPoktCliFolder(startDir: string): string | null;
/** Substitui ${VAR} pelo valor de process.env.VAR (vazio se não existir). */
export declare function expandEnvVarsInString(s: string): string;
/**
 * Converte uma entrada no estilo Cursor / Claude Desktop / Neon (mcp.json) para McpServerConfig.
 */
export declare function mcpJsonEntryToConfig(name: string, entry: Record<string, unknown>): McpServerConfig | null;
export interface LoadedProjectMcp {
    servers: McpServerConfig[];
    mcpJsonPath: string;
    poktDir: string;
}
/**
 * Lê <poktDir>/mcp.json e retorna servidores (vazio se arquivo inválido ou ausente).
 */
export declare function loadProjectMcpJson(poktDir: string): LoadedProjectMcp;
/**
 * Mescla config global do Pokt com servidores do projeto: mesmo `name` → o do projeto sobrescreve.
 */
export declare function mergeMcpConfigs(globalServers: McpServerConfig[], projectServers: McpServerConfig[]): McpServerConfig[];
/** Cria ./pokt_cli/mcp.json no diretório indicado (não sobrescreve se já existir). Retorna o caminho ou null. */
export declare function initProjectMcpJson(projectRootDir: string): {
    created: boolean;
    path: string;
    poktDir: string;
};
/** Servidores MCP efetivos: globais do usuário + mcp.json do projeto (projeto sobrescreve por nome). */
export declare function getMergedMcpServers(cwd?: string): {
    merged: McpServerConfig[];
    poktDir: string | null;
    mcpJsonPath: string | null;
};
