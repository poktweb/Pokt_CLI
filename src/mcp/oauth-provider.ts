/**
 * OAuth para MCP HTTP: callback local + tokens persistidos em pokt_cli/.mcp-oauth/
 */
import fs from 'fs';
import path from 'path';
import { createServer, type Server } from 'node:http';
import { URL } from 'node:url';
import type { OAuthClientMetadata, OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { openBrowser } from '../util/openBrowser.js';

interface PersistedOAuthState {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
}

function sanitizeFilePart(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'server';
}

export class FileBackedOAuthClientProvider implements OAuthClientProvider {
  private readonly statePath: string;
  private persisted: PersistedOAuthState = {};
  private codeVerifierMem?: string;

  constructor(
    private readonly redirectUrlStr: string,
    private readonly clientMetadataValue: OAuthClientMetadata,
    private readonly onRedirect: (url: URL) => void,
    poktDir: string,
    serverName: string
  ) {
    const dir = path.join(poktDir, '.mcp-oauth');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
    this.statePath = path.join(dir, `${sanitizeFilePart(serverName)}.json`);
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.statePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as PersistedOAuthState;
      this.persisted = raw ?? {};
    } catch {
      this.persisted = {};
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.persisted, null, 2), 'utf8');
    } catch {
      /* ignore */
    }
  }

  get redirectUrl(): string {
    return this.redirectUrlStr;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.clientMetadataValue;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.persisted.clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    this.persisted.clientInformation = clientInformation;
    this.save();
  }

  tokens(): OAuthTokens | undefined {
    return this.persisted.tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.persisted.tokens = tokens;
    this.save();
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.codeVerifierMem = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.codeVerifierMem) {
      throw new Error('PKCE code verifier não encontrado (fluxo OAuth incompleto).');
    }
    return this.codeVerifierMem;
  }
}

export interface OAuthCallbackHandle {
  redirectUrl: string;
  waitForCode: Promise<string>;
  close: () => Promise<void>;
}

/**
 * Servidor HTTP temporário para receber ?code= da autorização OAuth.
 */
export function startOAuthCallbackServer(): Promise<OAuthCallbackHandle> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
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
          res.end(
            '<html><body><h1>Autorizado</h1><p>Pode fechar esta aba e voltar ao terminal.</p></body></html>'
          );
          (server as unknown as { __resolveCode?: (c: string) => void }).__resolveCode?.(code);
        } else if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>Erro OAuth</h1><p>${error}</p></body></html>`);
          (server as unknown as { __rejectCode?: (e: Error) => void }).__rejectCode?.(new Error(error));
        } else {
          res.writeHead(400);
          res.end('Bad request');
          (server as unknown as { __rejectCode?: (e: Error) => void }).__rejectCode?.(new Error('Callback sem code'));
        }
      } catch (e) {
        res.writeHead(500);
        res.end();
        (server as unknown as { __rejectCode?: (e: Error) => void }).__rejectCode?.(
          e instanceof Error ? e : new Error(String(e))
        );
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

      const waitForCode = new Promise<string>((resolveCode, rejectCode) => {
        (server as unknown as { __resolveCode: (c: string) => void }).__resolveCode = (c: string) => {
          resolveCode(c);
          setTimeout(() => server.close(), 400);
        };
        (server as unknown as { __rejectCode: (e: Error) => void }).__rejectCode = rejectCode;
      });

      const close = (): Promise<void> =>
        new Promise((res) => {
          server.close(() => res());
        });

      resolve({ redirectUrl, waitForCode, close });
    });

    server.on('error', (err) => reject(err));
  });
}

export function defaultMcpOAuthClientMetadata(redirectUrl: string): OAuthClientMetadata {
  return {
    client_name: 'Pokt CLI',
    redirect_uris: [redirectUrl],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}

export function openAuthorizationInBrowser(url: URL): void {
  openBrowser(url.toString());
}
