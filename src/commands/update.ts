import type * as Yargs from 'yargs';
import { execSync } from 'child_process';
import { ui } from '../ui.js';

export const updateCommand: Yargs.CommandModule<{}, {}> = {
  command: 'update',
  describe: 'Atualiza o Pokt CLI para a última versão (npm install -g pokt-cli@latest)',
  builder: (yargs: Yargs.Argv) => yargs,
  handler: () => {
    console.log(ui.dim('Atualizando pokt-cli...\n'));
    try {
      execSync('npm install -g pokt-cli@latest', { stdio: 'inherit' });
      console.log(ui.success('Pokt CLI atualizado. Rode "pokt" para usar a nova versão.'));
    } catch (err) {
      console.log(ui.error('Falha ao atualizar. Tente manualmente: npm install -g pokt-cli@latest'));
      process.exitCode = 1;
    }
  }
};
