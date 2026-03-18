import { getProPurchaseUrl } from '../config.js';
import { openBrowser } from '../util/openBrowser.js';
import { ui } from '../ui.js';
export const proCommand = {
    command: 'pro',
    aliases: ['Pro'],
    describe: 'Abre a página inicial do Controller (botão "Torne-se Pro"). Use --url só para imprimir o link.',
    builder: (yargs) => yargs.option('url', {
        type: 'boolean',
        default: false,
        describe: 'Só mostra a URL no terminal (não abre o navegador)',
    }),
    handler: (argv) => {
        if (argv.url) {
            console.log(getProPurchaseUrl());
            return;
        }
        runProFlow();
    },
};
/** Usado pelo menu principal e pelo chat (/pro). */
export function runProFlow(printOnlyUrl = false) {
    const proHomeUrl = getProPurchaseUrl();
    if (printOnlyUrl) {
        console.log(proHomeUrl);
        return;
    }
    console.log(ui.dim('Pokt Pro — abra o site e clique em "Torne-se Pro" (pagamento + chave imediata).\n'));
    console.log(ui.accent(proHomeUrl));
    try {
        openBrowser(proHomeUrl);
        console.log(ui.success('\nAbrindo no navegador… Se não abrir, copie o link acima.\n'));
    }
    catch {
        console.log(ui.warn('Não foi possível abrir o navegador. Copie o link acima.\n'));
    }
}
