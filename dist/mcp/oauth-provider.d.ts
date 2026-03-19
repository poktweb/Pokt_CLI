import { URL } from 'node:url';
import type { OAuthClientMetadata, OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
export declare class FileBackedOAuthClientProvider implements OAuthClientProvider {
    private readonly redirectUrlStr;
    private readonly clientMetadataValue;
    private readonly onRedirect;
    private readonly statePath;
    private persisted;
    private codeVerifierMem?;
    constructor(redirectUrlStr: string, clientMetadataValue: OAuthClientMetadata, onRedirect: (url: URL) => void, poktDir: string, serverName: string);
    private load;
    private save;
    get redirectUrl(): string;
    get clientMetadata(): OAuthClientMetadata;
    clientInformation(): OAuthClientInformationMixed | undefined;
    saveClientInformation(clientInformation: OAuthClientInformationMixed): void;
    tokens(): OAuthTokens | undefined;
    saveTokens(tokens: OAuthTokens): void;
    redirectToAuthorization(authorizationUrl: URL): void;
    saveCodeVerifier(codeVerifier: string): void;
    codeVerifier(): string;
}
export interface OAuthCallbackHandle {
    redirectUrl: string;
    waitForCode: Promise<string>;
    close: () => Promise<void>;
}
/**
 * Servidor HTTP temporário para receber ?code= da autorização OAuth.
 */
export declare function startOAuthCallbackServer(): Promise<OAuthCallbackHandle>;
export declare function defaultMcpOAuthClientMetadata(redirectUrl: string): OAuthClientMetadata;
export declare function openAuthorizationInBrowser(url: URL): void;
