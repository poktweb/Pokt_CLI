import OpenAI from 'openai';
export declare const tools: OpenAI.Chat.Completions.ChatCompletionTool[];
export declare function executeTool(name: string, argsStr: string): Promise<string>;
