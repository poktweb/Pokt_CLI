import OpenAI from 'openai';
import {
  ModelConfig,
  getPoktApiBaseUrl,
  getProPortalBaseUrl,
  getOpenAIApiKey,
  getGrokApiKey,
  getOpenRouterToken,
  getGeminiApiKey,
  getOllamaCloudApiKey,
  getOllamaBaseUrl,
  getPoktToken,
} from '../config.js';

export async function getClient(modelConfig: ModelConfig): Promise<InstanceType<typeof OpenAI>> {
  // openai / grok / … → hosts oficiais abaixo. Só `controller` usa getPoktApiBaseUrl (token Pokt, não é api.openai.com).
  if (modelConfig.provider === 'controller') {
    const baseUrl = getPoktApiBaseUrl();
    const token = getPoktToken();
    if (!token) {
      throw new Error(
        `Token Pokt não configurado. Painel: ${getProPortalBaseUrl()} — pokt config set-pokt-token -v <token>`
      );
    }
    return new OpenAI({
      baseURL: `${baseUrl}/api/v1`,
      apiKey: token,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/pokt-cli',
        'X-Title': 'Pokt CLI',
      }
    });
  } else if (modelConfig.provider === 'openai') {
    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      throw new Error('OpenAI API key não configurada. Use: pokt config set-openai -v <key>');
    }
    return new OpenAI({
      baseURL: 'https://api.openai.com/v1',
      apiKey,
    });
  } else if (modelConfig.provider === 'grok') {
    const apiKey = getGrokApiKey();
    if (!apiKey) {
      throw new Error('Grok (xAI) API key não configurada. Use: pokt config set-grok -v <key>');
    }
    return new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey,
    });
  } else if (modelConfig.provider === 'openrouter') {
    return new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: getOpenRouterToken(),
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/pokt-cli',
        'X-Title': 'Pokt CLI',
      }
    });
  } else if (modelConfig.provider === 'gemini') {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not set. Use: pokt config set-gemini -v <key>');
    }
    return new OpenAI({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: apiKey,
    });
  } else if (modelConfig.provider === 'ollama-cloud') {
    const apiKey = getOllamaCloudApiKey();
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
      baseURL: `${getOllamaBaseUrl()}/v1`,
      apiKey: 'ollama',
    });
  }
}
