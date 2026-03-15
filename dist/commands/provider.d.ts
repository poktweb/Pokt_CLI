import type * as Yargs from 'yargs';
interface ProviderArgs {
    provider?: string;
}
export declare const providerCommand: Yargs.CommandModule<{}, ProviderArgs>;
export {};
