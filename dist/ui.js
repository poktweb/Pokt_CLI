import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function gradientColor(idx, len, start, end) {
    if (len <= 1)
        return start;
    const t = idx / (len - 1);
    return [
        Math.round(lerp(start[0], end[0], t)),
        Math.round(lerp(start[1], end[1], t)),
        Math.round(lerp(start[2], end[2], t)),
    ];
}
function gradientChars(text, start, end) {
    const chars = [...text];
    return chars.map((ch, i) => {
        if (ch === ' ')
            return ' ';
        const [r, g, b] = gradientColor(i, chars.length, start, end);
        return chalk.rgb(r, g, b).bold(ch);
    });
}
function getVersion() {
    // Prioridade: env de empacotamento → package.json → fallback
    const envVer = process.env.POKT_CLI_VERSION || process.env.npm_package_version;
    if (envVer)
        return envVer;
    try {
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        if (fs.existsSync(pkgPath)) {
            const raw = fs.readFileSync(pkgPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed?.version)
                return parsed.version;
        }
    }
    catch {
        // ignore
    }
    return 'dev';
}
function bannerLines(ver) {
    const left = [
        '██████╗  ██████╗ ██╗  ██╗████████╗',
        '██╔══██╗██╔═══██╗██║ ██╔╝╚══██╔══╝',
        '██████╔╝██║   ██║█████╔╝    ██║',
        '██╔═══╝ ██║   ██║██╔═██╗    ██║',
        '██║     ╚██████╔╝██║  ██╗   ██║',
        '╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝',
    ];
    const right = [
        '   ██████╗██╗     ██╗',
        '  ██╔════╝██║     ██║',
        '     ██║     ██║     ██║',
        '     ██║     ██║     ██║',
        '     ╚██████╗███████╗██║',
        '      ╚═════╝╚══════╝╚═╝',
    ];
    const lines = left.map((l, i) => `${l}${right[i] ?? ''}`);
    lines.push(' '.repeat(18) + `CLI Version v${ver}`);
    return lines;
}
function bannerAscii(ver) {
    const start = [0, 205, 255]; // azul/ciano
    const end = [155, 89, 255]; // roxo
    const lines = bannerLines(ver);
    return lines
        .map((line, i) => {
        if (i === lines.length - 1)
            return chalk.gray(line);
        return gradientChars(line, start, end).join('');
    })
        .join('\n');
}
async function printBannerAnimated(customVersion) {
    const ver = customVersion ?? getVersion();
    const start = [0, 205, 255];
    const end = [155, 89, 255];
    const lines = bannerLines(ver);
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li] ?? '';
        if (li === lines.length - 1) {
            process.stdout.write(chalk.gray(line) + '\n');
            continue;
        }
        const colored = gradientChars(line, start, end);
        for (let i = 0; i <= colored.length; i++) {
            process.stdout.write('\r' + colored.slice(0, i).join(''));
            await sleep(1);
        }
        process.stdout.write('\n');
    }
}
export const ui = {
    title: (text) => chalk.whiteBright.bold(text),
    subtitle: (text) => chalk.gray(text),
    success: (text) => chalk.green('✔ ' + text),
    error: (text) => chalk.red(text),
    warn: (text) => chalk.yellow(text),
    dim: (text) => chalk.gray(text),
    labelYou: () => chalk.cyan('Você:'),
    labelPokt: () => chalk.green('Pokt:'),
    accent: (text) => chalk.blue(text),
    muted: (text) => chalk.gray(text),
    /** Banner principal em ASCII (Pokt CLI) */
    banner: (customVersion) => {
        const ver = customVersion ?? getVersion();
        return bannerAscii(ver);
    },
    /** Imprime o banner com “typewriter” (letra por letra) */
    printBanner: async (opts) => {
        if (opts?.animate) {
            await printBannerAnimated(opts.version);
            return;
        }
        console.log(ui.banner(opts?.version));
    },
    /** Status de login / provider (uma linha) */
    statusLine: (providerLabel, configPath = '/config') => {
        const auth = chalk.gray(`Ativo: ${providerLabel}  ${chalk.underline(configPath)}`);
        return auth;
    },
    /** Seção "Tips for getting started" */
    tips: () => {
        const title = chalk.white('Dicas para começar:');
        const tips = [
            chalk.gray('1. Digite /help para ver comandos'),
            chalk.gray('2. Peça ajuda para codar, editar arquivos ou rodar comandos'),
            chalk.gray('3. Seja específico para melhores resultados'),
        ].join('\n');
        return title + '\n' + tips;
    },
    /** Linha de atalhos acima do input */
    shortcutsLine: (left = 'shift+tab para aceitar edições', right = '? para atalhos', center) => {
        const l = chalk.gray(left);
        const r = chalk.gray(right);
        const c = center ? chalk.gray(center) : '';
        const cl = center?.length ?? 0;
        if (c)
            return l + ' '.repeat(Math.max(0, 40 - left.length - cl)) + c + ' '.repeat(Math.max(0, 20 - right.length)) + r;
        return l + ' '.repeat(Math.max(0, 60 - left.length - right.length)) + r;
    },
    /** Placeholder do input */
    inputPlaceholder: () => chalk.gray('Digite sua mensagem (ou /help)'),
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
