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
    /** Banner principal estilo Gemini CLI: logo + nome + versão */
    banner: (customVersion?: string) => string;
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
