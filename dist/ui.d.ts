export declare const ui: {
    title: (text: string) => any;
    subtitle: (text: string) => any;
    success: (text: string) => any;
    error: (text: string) => any;
    warn: (text: string) => any;
    dim: (text: string) => any;
    labelYou: () => any;
    labelPokt: () => any;
    accent: (text: string) => any;
    muted: (text: string) => any;
    /** Banner principal em ASCII (Pokt CLI) */
    banner: (customVersion?: string) => string;
    /** Imprime o banner com “typewriter” (letra por letra) */
    printBanner: (opts?: {
        animate?: boolean;
        version?: string;
    }) => Promise<void>;
    /** Status de login / provider (uma linha) */
    statusLine: (providerLabel: string, configPath?: string) => any;
    /** Seção "Tips for getting started" */
    tips: () => string;
    /** Linha de atalhos acima do input */
    shortcutsLine: (left?: string, right?: string, center?: string) => string;
    /** Placeholder do input */
    inputPlaceholder: () => any;
    /** Barra de status inferior: path, branch, sandbox, model */
    statusBar: (opts: {
        cwd?: string;
        branch?: string;
        sandbox?: string;
        model?: string;
    }) => string;
    /** Separador visual sutil */
    separator: () => any;
};
