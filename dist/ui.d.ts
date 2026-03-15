export declare const ui: {
    title: (text: string) => string;
    subtitle: (text: string) => string;
    success: (text: string) => string;
    error: (text: string) => string;
    warn: (text: string) => string;
    dim: (text: string) => string;
    labelYou: () => string;
    labelPokt: () => string;
    accent: (text: string) => string;
    muted: (text: string) => string;
    /** Banner principal estilo Gemini CLI: logo + nome + versão */
    banner: (customVersion?: string) => string;
    /** Status de login / provider (uma linha) */
    statusLine: (providerLabel: string, configPath?: string) => string;
    /** Seção "Tips for getting started" */
    tips: () => string;
    /** Linha de atalhos acima do input */
    shortcutsLine: (left?: string, right?: string, center?: string) => string;
    /** Placeholder do input */
    inputPlaceholder: () => string;
    /** Barra de status inferior: path, branch, sandbox, model */
    statusBar: (opts: {
        cwd?: string;
        branch?: string;
        sandbox?: string;
        model?: string;
    }) => string;
    /** Separador visual sutil */
    separator: () => string;
};
