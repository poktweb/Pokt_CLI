import { spawn } from 'child_process';
/** Abre a URL no navegador padrão (Windows / macOS / Linux). */
export function openBrowser(url) {
    if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
    }
    else if (process.platform === 'darwin') {
        spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    else {
        spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
}
