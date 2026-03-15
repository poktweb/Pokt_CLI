import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions.js';
export declare const tools: ChatCompletionTool[];
export declare function executeTool(name: string, argsStr: string): Promise<string>;
