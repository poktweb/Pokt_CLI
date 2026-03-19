import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions.js';
type PersistedMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
};
export declare function getProjectHash(cwd?: string): string;
export declare function getSessionsDir(): string;
export declare function saveAuto(messages: ChatCompletionMessageParam[]): void;
export declare function loadAuto(): PersistedMessage[] | null;
export declare function listCheckpoints(): Array<{
    tag: string;
    updatedAt?: string;
}>;
export declare function saveCheckpoint(tag: string, messages: ChatCompletionMessageParam[]): void;
export declare function loadCheckpoint(tag: string): PersistedMessage[];
export declare function deleteCheckpoint(tag: string): void;
export declare function exportConversation(filename: string, messages: ChatCompletionMessageParam[]): string;
export {};
