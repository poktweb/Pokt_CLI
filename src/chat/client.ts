import OpenAI from 'openai';
import { config, ModelConfig } from '../config.js';

export function getClient(modelConfig: ModelConfig): OpenAI {
  if (modelConfig.provider === 'openrouter') {
    return new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.get('openrouterToken'),
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/pokt-cli',
        'X-Title': 'Pokt CLI',
      }
    });
  } else if (modelConfig.provider === 'gemini') {
    return new OpenAI({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: config.get('geminiApiKey'),
    });
  } else {
    // Ollama
    return new OpenAI({
      baseURL: `${config.get('ollamaBaseUrl')}/v1`,
      apiKey: 'ollama', // Ollama doesn't require a real API key
    });
  }
}
