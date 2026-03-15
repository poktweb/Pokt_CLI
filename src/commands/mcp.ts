import { CommandModule } from 'yargs';
import { config } from '../config.js';
import type { McpServerConfig } from '../config.js';
import { ui } from '../ui.js';
import { connectMcpServer, getAllMcpToolsOpenAI, disconnectAllMcp } from '../mcp/client.js';

export const mcpCommand: CommandModule = {
  command: 'mcp [action]',
  describe: 'Manage MCP (Model Context Protocol) servers',
  builder: (yargs) =>
    yargs
      .positional('action', {
        describe: 'Action: list, add, remove, test',
        type: 'string',
        choices: ['list', 'add', 'remove', 'test'],
      })
      .option('name', { describe: 'Server name (for add/remove)', type: 'string', alias: 'n' })
      .option('type', { describe: 'Server type: stdio or http', type: 'string', choices: ['stdio', 'http'] })
      .option('command', { describe: 'Command for stdio (e.g. npx)', type: 'string', alias: 'c' })
      .option('args', { describe: 'JSON array of args for stdio (e.g. \'["-y","mcp-server"]\')', type: 'string', alias: 'a' })
      .option('url', { describe: 'URL for http server', type: 'string', alias: 'u' }),
  handler: async (argv) => {
    const action = (argv.action as string) || 'list';
    const servers: McpServerConfig[] = config.get('mcpServers') ?? [];

    if (action === 'list') {
      if (servers.length === 0) {
        console.log(ui.dim('No MCP servers configured. Add one with: pokt mcp add -n <name> -t stdio -c npx -a \'["-y","mcp-server-name"]\''));
        return;
      }
      console.log(ui.title('\nMCP Servers:\n'));
      for (const s of servers) {
        const typeInfo = s.type === 'stdio'
          ? `${s.command} ${(s.args ?? []).join(' ')}`
          : (s.url ?? '');
        console.log(ui.dim(`  ${s.name}`), typeInfo);
      }
      console.log('');
      return;
    }

    if (action === 'add') {
      const name = argv.name as string | undefined;
      const type = (argv.type as 'stdio' | 'http') ?? 'stdio';
      if (!name?.trim()) {
        console.log(ui.error('--name is required. Example: pokt mcp add -n filesystem -t stdio -c npx -a \'["-y","@modelcontextprotocol/server-filesystem"]\''));
        return;
      }
      if (servers.some(s => s.name === name)) {
        console.log(ui.error(`Server "${name}" already exists. Use "pokt mcp remove -n ${name}" first.`));
        return;
      }
      if (type === 'stdio') {
        const command = argv.command as string | undefined;
        if (!command?.trim()) {
          console.log(ui.error('For stdio, --command is required (e.g. npx).'));
          return;
        }
        let args: string[] = [];
        if (argv.args) {
          try {
            args = JSON.parse(argv.args as string) as string[];
          } catch {
            console.log(ui.error('--args must be a JSON array, e.g. \'["-y","mcp-server"]\''));
            return;
          }
        }
        config.set('mcpServers', [...servers, { name, type: 'stdio', command, args }]);
      } else {
        const url = argv.url as string | undefined;
        if (!url?.trim()) {
          console.log(ui.error('For http, --url is required.'));
          return;
        }
        config.set('mcpServers', [...servers, { name, type: 'http', url }]);
      }
      console.log(ui.success(`MCP server "${name}" added. Use "pokt chat" to use its tools.`));
      return;
    }

    if (action === 'remove') {
      const name = argv.name as string | undefined;
      if (!name?.trim()) {
        console.log(ui.error('--name is required. Example: pokt mcp remove -n filesystem'));
        return;
      }
      const next = servers.filter(s => s.name !== name);
      if (next.length === servers.length) {
        console.log(ui.warn(`No server named "${name}" found.`));
        return;
      }
      config.set('mcpServers', next);
      console.log(ui.success(`MCP server "${name}" removed.`));
      return;
    }

    if (action === 'test') {
      const name = argv.name as string | undefined;
      const toTest = name ? servers.filter(s => s.name === name) : servers;
      if (toTest.length === 0) {
        console.log(ui.warn(name ? `No server named "${name}".` : 'No MCP servers configured.'));
        return;
      }
      console.log(ui.dim('\nConnecting to MCP server(s)...\n'));
      for (const server of toTest) {
        if (server.type !== 'stdio') {
          console.log(ui.warn(`  ${server.name}: HTTP not yet supported in test.`));
          continue;
        }
        try {
          const session = await connectMcpServer(server);
          if (session) {
            const openaiTools = getAllMcpToolsOpenAI();
            const count = session.tools.length;
            console.log(ui.success(`  ${server.name}: OK (${count} tools)`));
            for (const t of session.tools) {
              console.log(ui.dim(`    - ${t.exposedName}`));
            }
          } else {
            console.log(ui.error(`  ${server.name}: Connection failed.`));
          }
        } catch (e) {
          console.log(ui.error(`  ${server.name}: ${(e as Error).message}`));
        }
      }
      await disconnectAllMcp();
      console.log('');
      return;
    }
  },
};
