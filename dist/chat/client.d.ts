import OpenAI from 'openai';
import { ModelConfig } from '../config.js';
export declare function getClient(modelConfig: ModelConfig): Promise<OpenAI>;
