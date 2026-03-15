import { execSync } from 'child_process';
import { ui } from '../ui.js';
export const uninstallCommand = {
    command: 'uninstall',
    describe: 'Remove o Pokt CLI da instalação global (npm uninstall -g pokt-cli)',
    builder: (yargs) => yargs,
    handler: () => {
        console.log(ui.dim('Removendo pokt-cli...\n'));
        try {
            execSync('npm uninstall -g pokt-cli', { stdio: 'inherit' });
            console.log(ui.success('Pokt CLI removido. O comando "pokt" não estará mais disponível.'));
        }
        catch (err) {
            console.log(ui.warn('Para remover manualmente execute: npm uninstall -g pokt-cli'));
            process.exitCode = 1;
        }
    }
};
