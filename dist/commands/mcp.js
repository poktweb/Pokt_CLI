import { config } from '../config.js';
import { ui } from '../ui.js';
import { connectMcpServer, disconnectAllMcp } from '../mcp/client.js';
import { getMergedMcpServers, initProjectMcpJson } from '../mcp/project-mcp.js';
function tagSource(s) {
    return s.source === 'project' ? ui.dim('[projeto]') : ui.dim('[global]');
}
export const mcpCommand = {
    command: 'mcp [action]',
    describe: 'Manage MCP (Model Context Protocol) servers — global + pokt_cli/mcp.json do projeto',
    builder: (yargs) => yargs
        .positional('action', {
        describe: 'Action: list, add, remove, test, init, link',
        type: 'string',
        choices: ['list', 'add', 'remove', 'test', 'init', 'link'],
    })
        .option('name', { describe: 'Server name (for add/remove/test/link)', type: 'string', alias: 'n' })
        .option('type', { describe: 'Server type: stdio or http', type: 'string', choices: ['stdio', 'http'] })
        .option('command', { describe: 'Command for stdio (e.g. npx)', type: 'string', alias: 'c' })
        .option('args', { describe: 'JSON array of args for stdio (e.g. \'["-y","mcp-server"]\')', type: 'string', alias: 'a' })
        .option('url', { describe: 'URL for http server', type: 'string', alias: 'u' })
        .option('oauth', { describe: 'HTTP: usar fluxo OAuth (navegador)', type: 'boolean', default: false })
        .option('transport', {
        describe: 'HTTP: streamable-http (padrão) ou sse',
        type: 'string',
        choices: ['streamable-http', 'sse'],
    }),
    handler: async (argv) => {
        const action = argv.action || 'list';
        const globalServers = config.get('mcpServers') ?? [];
        const { merged, poktDir, mcpJsonPath } = getMergedMcpServers(process.cwd());
        if (action === 'list') {
            if (poktDir) {
                console.log(ui.dim(`Pasta Pokt do projeto: ${poktDir}`));
                console.log(ui.dim(`mcp.json: ${mcpJsonPath ?? '(não encontrado)'}`));
                console.log('');
            }
            else {
                console.log(ui.dim('Nenhuma pasta pokt_cli/Pot_cli encontrada acima do diretório atual.'));
                console.log(ui.dim('Dica: pokt mcp init — cria ./pokt_cli/mcp.json neste diretório.\n'));
            }
            if (merged.length === 0) {
                console.log(ui.dim('Nenhum servidor MCP. Adicione no projeto (pokt_cli/mcp.json) ou global: pokt mcp add -n <name> -t stdio -c npx -a \'["-y","mcp-server"]\''));
                return;
            }
            console.log(ui.title('\nMCP Servers (mesclado: global + projeto):\n'));
            for (const s of merged) {
                const typeInfo = s.type === 'stdio'
                    ? `${s.command} ${(s.args ?? []).join(' ')}`
                    : `${s.url ?? ''}${s.oauth ? ' (OAuth)' : ''}${s.httpTransport === 'sse' ? ' [SSE]' : ''}`;
                console.log(tagSource(s), ui.dim(`  ${s.name}`), typeInfo);
            }
            console.log('');
            return;
        }
        if (action === 'init') {
            const r = initProjectMcpJson(process.cwd());
            if (r.created) {
                console.log(ui.success(`Criado: ${r.path}`));
                console.log(ui.dim('Edite mcp.json e rode: pokt chat (ou pokt mcp test) no diretório do projeto.'));
            }
            else {
                console.log(ui.warn(`Já existe: ${r.path}`));
            }
            return;
        }
        if (action === 'add') {
            const name = argv.name;
            const type = argv.type ?? 'stdio';
            if (!name?.trim()) {
                console.log(ui.error('--name é obrigatório. Ex.: pokt mcp add -n filesystem -t stdio -c npx -a \'["-y","@modelcontextprotocol/server-filesystem"]\''));
                return;
            }
            if (globalServers.some((s) => s.name === name)) {
                console.log(ui.error(`Servidor global "${name}" já existe. Use: pokt mcp remove -n ${name}`));
                return;
            }
            if (type === 'stdio') {
                const command = argv.command;
                if (!command?.trim()) {
                    console.log(ui.error('Para stdio, --command é obrigatório (ex.: npx).'));
                    return;
                }
                let args = [];
                if (argv.args) {
                    try {
                        args = JSON.parse(argv.args);
                    }
                    catch {
                        console.log(ui.error('--args deve ser um array JSON, ex.: \'["-y","mcp-server"]\''));
                        return;
                    }
                }
                config.set('mcpServers', [...globalServers, { name, type: 'stdio', command, args }]);
            }
            else {
                const url = argv.url;
                if (!url?.trim()) {
                    console.log(ui.error('Para http, --url é obrigatório.'));
                    return;
                }
                const httpTransport = argv.transport === 'sse' ? 'sse' : 'streamable-http';
                config.set('mcpServers', [
                    ...globalServers,
                    {
                        name,
                        type: 'http',
                        url,
                        oauth: argv.oauth === true,
                        httpTransport,
                    },
                ]);
            }
            console.log(ui.success(`Servidor MCP global "${name}" adicionado. Use "pokt chat" no projeto com pokt_cli/mcp.json se quiser por repositório.`));
            return;
        }
        if (action === 'remove') {
            const name = argv.name;
            if (!name?.trim()) {
                console.log(ui.error('--name é obrigatório. Ex.: pokt mcp remove -n filesystem'));
                return;
            }
            const next = globalServers.filter((s) => s.name !== name);
            if (next.length === globalServers.length) {
                console.log(ui.warn(`Não há servidor global "${name}". (Entradas só em mcp.json do projeto: edite o arquivo.)`));
                return;
            }
            config.set('mcpServers', next);
            console.log(ui.success(`Servidor global "${name}" removido.`));
            return;
        }
        if (action === 'link') {
            const name = argv.name;
            if (!name?.trim()) {
                console.log(ui.error('Use: pokt mcp link -n <nome-do-servidor-http-com-oauth>'));
                return;
            }
            const server = merged.find((s) => s.name === name);
            if (!server) {
                console.log(ui.warn(`Servidor "${name}" não encontrado na config mesclada.`));
                return;
            }
            if (server.type !== 'http' || !server.oauth) {
                console.log(ui.warn(`"${name}" precisa ser type http com oauth: true no mcp.json (ou config global).`));
                return;
            }
            console.log(ui.dim(`\nVinculando OAuth: ${name}...\n`));
            const session = await connectMcpServer(server);
            if (session) {
                console.log(ui.success(`OK — ${session.tools.length} tools. Tokens salvos em pokt_cli/.mcp-oauth/`));
                for (const t of session.tools) {
                    console.log(ui.dim(`    - ${t.exposedName}`));
                }
            }
            else {
                console.log(ui.error('Falha ao conectar / autorizar.'));
            }
            await disconnectAllMcp();
            console.log('');
            return;
        }
        if (action === 'test') {
            const name = argv.name;
            const toTest = name ? merged.filter((s) => s.name === name) : merged;
            if (toTest.length === 0) {
                console.log(ui.warn(name ? `Nenhum servidor "${name}".` : 'Nenhum servidor MCP (global ou projeto).'));
                return;
            }
            console.log(ui.dim('\nConectando aos servidores MCP...\n'));
            for (const server of toTest) {
                try {
                    const session = await connectMcpServer(server);
                    if (session) {
                        const count = session.tools.length;
                        console.log(ui.success(`  ${server.name}: OK (${count} tools) ${tagSource(server)}`));
                        for (const t of session.tools) {
                            console.log(ui.dim(`    - ${t.exposedName}`));
                        }
                    }
                    else {
                        console.log(ui.error(`  ${server.name}: falha na conexão.`));
                    }
                }
                catch (e) {
                    console.log(ui.error(`  ${server.name}: ${e.message}`));
                }
            }
            await disconnectAllMcp();
            console.log('');
            return;
        }
    },
};
