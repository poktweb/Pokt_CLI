/**
 * Reduz o tamanho do array `tools` enviado à API (ex.: Pokt Controller com body limit baixo).
 * Schemas MCP (Neon etc.) podem ter dezenas de KB por tool.
 */
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions.js';

const MAX_FUNCTION_DESCRIPTION_CHARS = 520;
const MAX_SCHEMA_STRING_CHARS = 480;
const MAX_TOOL_PARAMETERS_JSON_CHARS = 22_000;

function deepTruncateStrings(obj: unknown, maxLen: number, depth = 0): unknown {
  if (depth > 14) return obj;
  if (typeof obj === 'string') {
    if (obj.length <= maxLen) return obj;
    return `${obj.slice(0, Math.max(0, maxLen - 1))}…`;
  }
  if (Array.isArray(obj)) {
    const cap = 80;
    const arr = obj.length > cap ? obj.slice(0, cap) : obj;
    return arr.map((x) => deepTruncateStrings(x, maxLen, depth + 1));
  }
  if (obj !== null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = deepTruncateStrings(o[k], maxLen, depth + 1);
    }
    return out;
  }
  return obj;
}

/** Último recurso: schema aberto (o modelo já vê nomes exatos no system prompt). */
function fallbackOpenEndedParameters(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    description: 'JSON com os argumentos da tool MCP (ex.: projectId, branchId, sql).',
  };
}

export function slimToolsForUpstreamPayload(tools: ChatCompletionTool[]): ChatCompletionTool[] {
  return tools.map((t) => {
    if (t.type !== 'function' || !t.function) return t;
    const fn = t.function;
    const rawDesc = fn.description ?? '';
    const description =
      rawDesc.length <= MAX_FUNCTION_DESCRIPTION_CHARS
        ? rawDesc
        : `${rawDesc.slice(0, MAX_FUNCTION_DESCRIPTION_CHARS - 1)}…`;

    let parameters = fn.parameters;
    if (parameters && typeof parameters === 'object') {
      parameters = deepTruncateStrings(parameters, MAX_SCHEMA_STRING_CHARS) as typeof parameters;
    }
    let jsonLen = JSON.stringify(parameters ?? {}).length;
    if (jsonLen > MAX_TOOL_PARAMETERS_JSON_CHARS) {
      parameters = deepTruncateStrings(parameters, 220) as typeof parameters;
      jsonLen = JSON.stringify(parameters ?? {}).length;
    }
    if (jsonLen > MAX_TOOL_PARAMETERS_JSON_CHARS) {
      parameters = fallbackOpenEndedParameters() as typeof parameters;
    }

    return {
      type: 'function',
      function: {
        name: fn.name,
        description,
        parameters,
      },
    };
  });
}
