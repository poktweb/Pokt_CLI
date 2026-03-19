/**
 * OAuth para MCP HTTP: callback local + tokens persistidos em pokt_cli/.mcp-oauth/
 */
import fs from 'fs';
import path from 'path';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { openBrowser } from '../util/openBrowser.js';
function sanitizeFilePart(name) {
    return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'server';
}
export class FileBackedOAuthClientProvider {
    redirectUrlStr;
    clientMetadataValue;
    onRedirect;
    statePath;
    persisted = {};
    codeVerifierMem;
    constructor(redirectUrlStr, clientMetadataValue, onRedirect, poktDir, serverName) {
        this.redirectUrlStr = redirectUrlStr;
        this.clientMetadataValue = clientMetadataValue;
        this.onRedirect = onRedirect;
        const dir = path.join(poktDir, '.mcp-oauth');
        try {
            fs.mkdirSync(dir, { recursive: true });
        }
        catch {
            /* ignore */
        }
        this.statePath = path.join(dir, `${sanitizeFilePart(serverName)}.json`);
        this.load();
    }
    load() {
        try {
            if (!fs.existsSync(this.statePath))
                return;
            const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
            this.persisted = raw ?? {};
        }
        catch {
            this.persisted = {};
        }
    }
    save() {
        try {
            fs.writeFileSync(this.statePath, JSON.stringify(this.persisted, null, 2), 'utf8');
        }
        catch {
            /* ignore */
        }
    }
    get redirectUrl() {
        return this.redirectUrlStr;
    }
    get clientMetadata() {
        return this.clientMetadataValue;
    }
    clientInformation() {
        return this.persisted.clientInformation;
    }
    saveClientInformation(clientInformation) {
        this.persisted.clientInformation = clientInformation;
        this.save();
    }
    tokens() {
        return this.persisted.tokens;
    }
    saveTokens(tokens) {
        this.persisted.tokens = tokens;
        this.save();
    }
    redirectToAuthorization(authorizationUrl) {
        this.onRedirect(authorizationUrl);
    }
    saveCodeVerifier(codeVerifier) {
        this.codeVerifierMem = codeVerifier;
    }
    codeVerifier() {
        if (!this.codeVerifierMem) {
            throw new Error('PKCE code verifier não encontrado (fluxo OAuth incompleto).');
        }
        return this.codeVerifierMem;
    }
}
/**
 * Servidor HTTP temporário para receber ?code= da autorização OAuth.
 */
export function startOAuthCallbackServer() {
    return new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            if (req.url === '/favicon.ico') {
                res.writeHead(404);
                res.end();
                return;
            }
            try {
                const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
                const code = parsedUrl.searchParams.get('code');
                const error = parsedUrl.searchParams.get('error');
                if (code) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<html><body><h1>Autorizado</h1><p>Pode fechar esta aba e voltar ao terminal.</p></body></html>');
                    server.__resolveCode?.(code);
                }
                else if (error) {
                    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<html><body><h1>Erro OAuth</h1><p>${error}</p></body></html>`);
                    server.__rejectCode?.(new Error(error));
                }
                else {
                    res.writeHead(400);
                    res.end('Bad request');
                    server.__rejectCode?.(new Error('Callback sem code'));
                }
            }
            catch (e) {
                res.writeHead(500);
                res.end();
                server.__rejectCode?.(e instanceof Error ? e : new Error(String(e)));
            }
        });
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            if (!port) {
                server.close();
                reject(new Error('Não foi possível abrir porta para OAuth callback'));
                return;
            }
            const redirectUrl = `http://127.0.0.1:${port}/callback`;
            const waitForCode = new Promise((resolveCode, rejectCode) => {
                server.__resolveCode = (c) => {
                    resolveCode(c);
                    setTimeout(() => server.close(), 400);
                };
                server.__rejectCode = rejectCode;
            });
            const close = () => new Promise((res) => {
                server.close(() => res());
            });
            resolve({ redirectUrl, waitForCode, close });
        });
        server.on('error', (err) => reject(err));
    });
}
export function defaultMcpOAuthClientMetadata(redirectUrl) {
    return {
        client_name: 'Pokt CLI',
        redirect_uris: [redirectUrl],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
    };
}
export function openAuthorizationInBrowser(url) {
    openBrowser(url.toString());
}
