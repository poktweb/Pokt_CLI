/** Envia uso (tokens, modelo, provedor) ao Pokt_CLI_Back — não bloqueia o chat; falhas são ignoradas. */
export declare function sendCliUsageTelemetryFireAndForget(params: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number | null;
}): void;
export type ChatUsageAccumulator = {
    prompt: number;
    completion: number;
    cost: number | null;
};
export declare function emptyUsageAccumulator(): ChatUsageAccumulator;
export declare function mergeCompletionUsage(acc: ChatUsageAccumulator, completion: {
    usage?: unknown;
}): void;
