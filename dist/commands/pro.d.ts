import type * as Yargs from 'yargs';
export declare const proCommand: Yargs.CommandModule<{}, {
    url?: boolean;
}>;
/** Usado pelo menu principal e pelo chat (/pro). */
export declare function runProFlow(printOnlyUrl?: boolean): void;
