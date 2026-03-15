import type * as Yargs from 'yargs';
interface ModelsArgs {
    action?: string;
    id?: string;
    provider?: string;
}
export declare const modelsCommand: Yargs.CommandModule<{}, ModelsArgs>;
export {};
