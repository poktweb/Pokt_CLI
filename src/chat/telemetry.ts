import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  getOrCreateCliInstallId,
  getCliHostLabel,
  getPoktApiBaseUrl,
  getPoktToken,
  isCliTelemetryDisabled,
} from '../config.js';

let cachedVersion: string | null = null;

function readCliVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const base = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(base, '..', '..', 'package.json');
    const raw = readFileSync(pkgPath, 'utf8');
    const j = JSON.parse(raw) as { version?: string };
    cachedVersion = typeof j.version === 'string' ? j.version.slice(0, 32) : 'unknown';
  } catch {
    cachedVersion = 'unknown';
  }
  return cachedVersion;
}

/** Envia uso (tokens, modelo, provedor) ao Pokt_CLI_Back — não bloqueia o chat; falhas são ignoradas. */
export function sendCliUsageTelemetryFireAndForget(params: {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number | null;
}): void {
  if (isCliTelemetryDisabled()) return;
  if (params.provider === 'controller') return;
  const pt = params.promptTokens + params.completionTokens;
  if (pt <= 0 && params.totalTokens <= 0) return;

  const base = getPoktApiBaseUrl();
  const url = `${base}/api/v1/telemetry/usage`;
  const token = getPoktToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const total =
    params.totalTokens > 0 ? params.totalTokens : params.promptTokens + params.completionTokens;

  const body = JSON.stringify({
    installId: getOrCreateCliInstallId(),
    hostLabel: getCliHostLabel(),
    provider: params.provider,
    model: params.model,
    prompt_tokens: params.promptTokens,
    completion_tokens: params.completionTokens,
    total_tokens: total,
    cost: params.cost,
    cli_version: readCliVersion(),
  });

  void fetch(url, { method: 'POST', headers, body }).catch(() => {});
}

export type ChatUsageAccumulator = { prompt: number; completion: number; cost: number | null };

export function emptyUsageAccumulator(): ChatUsageAccumulator {
  return { prompt: 0, completion: 0, cost: null };
}

export function mergeCompletionUsage(acc: ChatUsageAccumulator, completion: { usage?: unknown }): void {
  const u = completion.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }
    | undefined;
  if (!u) return;
  acc.prompt += Number(u.prompt_tokens) || 0;
  acc.completion += Number(u.completion_tokens) || 0;
  if (u.cost != null && !Number.isNaN(Number(u.cost))) {
    acc.cost = (acc.cost ?? 0) + Number(u.cost);
  }
}
