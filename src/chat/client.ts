import OpenAI from 'openai';
import { config, ModelConfig } from '../config.js';
import { GoogleAuth } from 'google-auth-library';

export async function getClient(modelConfig: ModelConfig): Promise<OpenAI> {
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
    const apiKey = config.get('geminiApiKey');
    const googleToken = config.get('googleToken');
    
    if (apiKey) {
      return new OpenAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: apiKey,
      });
    } else if (googleToken && googleToken.access_token) {
      return new OpenAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: googleToken.access_token,
      });
    } else {
      // Try to use Application Default Credentials (ADC)
      try {
        const auth = new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/generative-language']
        });
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        const token = tokenResponse.token;

        if (token) {
          return new OpenAI({
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
            apiKey: token,
          });
        }
      } catch (e) {
        // ADC failed, fallback to error
      }
      throw new Error('No Gemini authentication found (API Key, Google Login, or ADC).');
    }
  } else {
    // Ollama
    return new OpenAI({
      baseURL: `${config.get('ollamaBaseUrl')}/v1`,
      apiKey: 'ollama',
    });
  }
}
