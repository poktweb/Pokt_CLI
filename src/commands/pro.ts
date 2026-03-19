import type * as Yargs from 'yargs';
import { getProPurchaseUrl } from '../config.js';
import { openBrowser } from '../util/openBrowser.js';
import { ui } from '../ui.js';

export const proCommand: Yargs.CommandModule<{}, { url?: boolean }> = {
  command: 'pro',
  aliases: ['Pro'],
  describe: 'Abre a página de compra de token no Controller (Vercel). Painel/API usam a Railway. Use --url só para imprimir o link.',
  builder: (yargs: Yargs.Argv) =>
    yargs.option('url', {
      type: 'boolean',
      default: false,
      describe: 'Só mostra a URL no terminal (não abre o navegador)',
    }),
  handler: (argv: { url?: boolean }) => {
    if (argv.url) {
      console.log(getProPurchaseUrl());
      return;
    }
    runProFlow();
  },
};

/** Usado pelo menu principal e pelo chat (/pro). */
export function runProFlow(printOnlyUrl = false): void {
  const proHomeUrl = getProPurchaseUrl();
  if (printOnlyUrl) {
    console.log(proHomeUrl);
    return;
  }
  console.log(ui.dim('Comprar token Pokt — abre o site na Vercel (pagamento). Painel/API: Railway.\n'));
  console.log(ui.accent(proHomeUrl));
  try {
    openBrowser(proHomeUrl);
    console.log(ui.success('\nAbrindo no navegador… Se não abrir, copie o link acima.\n'));
  } catch {
    console.log(ui.warn('Não foi possível abrir o navegador. Copie o link acima.\n'));
  }
}
