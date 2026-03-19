/**
 * Reduz o tamanho do array `tools` enviado à API (ex.: Pokt Controller com body limit baixo).
 * Schemas MCP (Neon etc.) podem ter dezenas de KB por tool.
 */
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions.js';
export declare function slimToolsForUpstreamPayload(tools: ChatCompletionTool[]): ChatCompletionTool[];
