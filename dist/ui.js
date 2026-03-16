import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
const VERSION = '1.0.4';
/** Logo em estilo chevron com gradiente (azul → rosa → roxo) */
function logo() {
    const c = (s, color) => color(s);
    const block = (char, col) => col(char);
    const blue = chalk.rgb(100, 149, 237);
    const pink = chalk.rgb(255, 105, 180);
    const purple = chalk.rgb(147, 112, 219);
    return block('▸', blue) + ' ' + block('▸', pink) + ' ' + block('▸', purple);
}
export const ui = {
    title: (text) => chalk.whiteBright.bold(text),
    subtitle: (text) => chalk.gray(text),
    success: (text) => chalk.green('✔ ' + text),
    error: (text) => chalk.red(text),
    warn: (text) => chalk.yellow(text),
    dim: (text) => chalk.gray(text),
    labelYou: () => chalk.cyan('You:'),
    labelPokt: () => chalk.green('Pokt:'),
    accent: (text) => chalk.blue(text),
    muted: (text) => chalk.gray(text),
    /** Banner principal estilo Gemini CLI: logo + nome + versão */
    banner: (customVersion) => {
        const ver = customVersion ?? VERSION;
        const line1 = logo() + '  ' + chalk.whiteBright.bold('Pokt CLI') + chalk.gray(` v${ver}`);
        return line1;
    },
    /** Status de login / provider (uma linha) */
    statusLine: (providerLabel, configPath = '/config') => {
        const auth = chalk.gray(`Logged in with ${providerLabel} ${chalk.underline(configPath)}`);
        return auth;
    },
    /** Seção "Tips for getting started" */
    tips: () => {
        const title = chalk.white('Tips for getting started:');
        const tips = [
            chalk.gray('1. /help for more information'),
            chalk.gray('2. Ask coding questions, edit code or run commands'),
            chalk.gray('3. Be specific for the best results'),
        ].join('\n');
        return title + '\n' + tips;
    },
    /** Linha de atalhos acima do input */
    shortcutsLine: (left = 'shift+tab to accept edits', right = '? for shortcuts', center) => {
        const l = chalk.gray(left);
        const r = chalk.gray(right);
        const c = center ? chalk.gray(center) : '';
        const cl = center?.length ?? 0;
        if (c)
            return l + ' '.repeat(Math.max(0, 40 - left.length - cl)) + c + ' '.repeat(Math.max(0, 20 - right.length)) + r;
        return l + ' '.repeat(Math.max(0, 60 - left.length - right.length)) + r;
    },
    /** Placeholder do input */
    inputPlaceholder: () => chalk.gray('Type your message or @path/to/file'),
    /** Barra de status inferior: path, branch, sandbox, model */
    statusBar: (opts) => {
        const cwd = opts.cwd ?? process.cwd();
        const short = cwd.replace(process.env.HOME || process.env.USERPROFILE || '', '~');
        const branch = opts.branch ?? getGitBranch();
        const sandbox = opts.sandbox ?? chalk.red('no sandbox') + chalk.gray(' (see /docs)');
        const model = opts.model ?? chalk.gray('/model Auto');
        const left = chalk.white(short + (branch ? ` (${branch})` : ''));
        return left + '  ' + sandbox + '  ' + model;
    },
    /** Separador visual sutil */
    separator: () => chalk.gray('─'.repeat(50)),
};
function getGitBranch() {
    try {
        const gitHead = path.join(process.cwd(), '.git', 'HEAD');
        if (!fs.existsSync(gitHead))
            return '';
        const content = fs.readFileSync(gitHead, 'utf8').trim();
        const match = content.match(/ref: refs\/heads\/(.+)/);
        return match ? match[1] + (hasUncommitted() ? '*' : '') : '';
    }
    catch {
        return '';
    }
}
function hasUncommitted() {
    try {
        execSync('git diff --quiet && git diff --cached --quiet', { stdio: 'ignore' });
        return false;
    }
    catch {
        return true;
    }
}
