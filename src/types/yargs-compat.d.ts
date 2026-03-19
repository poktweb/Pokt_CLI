declare module 'yargs' {
  export type Arguments<T = Record<string, unknown>> = T & Record<string, unknown>;

  export interface Argv<T = Record<string, unknown>> {
    [key: string]: any;
    scriptName(name: string): this;
    usage(text: string): this;
    command(module: CommandModule): this;
    demandCommand(min: number, msg: string): this;
    help(): this;
    parse(): unknown;
  }

  export interface CommandModule<T = Record<string, unknown>, U = T> {
    [key: string]: any;
    command: string;
    describe?: string;
    builder?: (yargs: Argv<T>) => Argv<U>;
    handler: (args: Arguments<U>) => void | Promise<void>;
  }

  const yargs: any;
  export default yargs;
}

declare module 'yargs/helpers' {
  export function hideBin(argv: readonly string[]): string[];
}

