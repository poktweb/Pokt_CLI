import type * as Yargs from 'yargs';
interface ConfigArgs {
    action?: string;
    value?: string | string[];
}
export declare const configCommand: Yargs.CommandModule<{}, ConfigArgs>;
export {};
