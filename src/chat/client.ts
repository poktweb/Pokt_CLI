import OpenAI from 'openai';
import { config, ModelConfig, getControllerBaseUrl } from '../config.js';

export async function getClient(modelConfig: ModelConfig): Promise<InstanceType<typeof OpenAI>> {
  if (modelConfig.provider === 'controller') {
    const baseUrl = getControllerBaseUrl();
    const token = config.get('poktToken');
    if (!token) {
      throw new Error('Token Pokt não configurado. No painel gere um token e use: pokt config set-pokt-token -v <token>');
    }
    return new OpenAI({
      baseURL: `${baseUrl}/api/v1`,
      apiKey: token,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/pokt-cli',
        'X-Title': 'Pokt CLI',
      }
    });
  } else if (modelConfig.provider === 'openrouter') {
    return new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.get('openrouterToken'),
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/pokt-cli',
        'X-Title': 'Pokt CLI',
      }
    });
  } else if (modelConfig.provider === 'gemini') {
    const apiKey = config.get('geminiApiKey');
    if (!apiKey) {
      throw new Error('Gemini API key not set. Use: pokt config set-gemini -v <key>');
    }
    return new OpenAI({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: apiKey,
    });
  } else if (modelConfig.provider === 'ollama-cloud') {
    const apiKey = config.get('ollamaCloudApiKey');
    if (!apiKey) {
      throw new Error('Ollama Cloud API key não configurada. Crie uma em https://ollama.com/settings/keys e use: pokt config set-ollama-cloud -v <key>');
    }
    return new OpenAI({
      baseURL: 'https://ollama.com/v1',
      apiKey,
      defaultHeaders: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } else {
    // Ollama (local) — não precisa de API key
    return new OpenAI({
      baseURL: `${config.get('ollamaBaseUrl')}/v1`,
      apiKey: 'ollama',
    });
  }
}
