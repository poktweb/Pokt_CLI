import type * as Yargs from 'yargs';
interface McpArgs {
    action?: string;
    name?: string;
    type?: string;
    command?: string;
    args?: string;
    url?: string;
    oauth?: boolean;
    transport?: string;
}
export declare const mcpCommand: Yargs.CommandModule<{}, McpArgs>;
export {};
