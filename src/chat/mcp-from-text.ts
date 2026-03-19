/**
 * Fallback: alguns modelos emitem invocações MCP em blocos ```bash``` em vez de tool_calls.
 * Extraímos linhas `mcp_* ...` e executamos contra os servidores MCP conectados.
 */
import { ui } from '../ui.js';
import { callMcpTool, getMcpExposedToolNames, getMcpToolParameterKeys } from '../mcp/client.js';

const BASH_BLOCK_RE =
  /```(?:bash|sh|shell|zsh|powershell|ps1|cmd)\s*\n([\s\S]*?)```/gi;

function mcpBashFallbackVerbose(): boolean {
  return process.env.POKT_VERBOSE_MCP === '1' || process.env.POKT_VERBOSE === '1';
}

/**
 * Remove blocos ```bash``` que são só invocações MCP (às vezes `mcp_*` numa linha e JSON na seguinte).
 */
export function stripExecutedStyleMcpBashBlocks(content: string): string {
  const re = new RegExp(BASH_BLOCK_RE.source, BASH_BLOCK_RE.flags);
  return content.replace(re, (full, body: string) => {
    if (!/mcp_[A-Za-z0-9_-]+/i.test(body)) return full;
    const lower = body.toLowerCase();
    const shellish =
      /\b(if |then|\bfi\b|\bfor\b|\bdo\b|\bdone\b|\bwhile\b|curl |wget |\bgit\b|\bnpm\b|\bpnpm\b|\bcd |\bexport |\$\{)/.test(
        lower
      );
    if (shellish) return full;
    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return full;
    const mcpOrJsonLine = (l: string) => {
      if (parseMcpShellLine(l) !== null) return true;
      const t = l.trim();
      if (t.startsWith('{') && t.endsWith('}')) return true;
      if (t.startsWith('[') && t.endsWith(']')) return true;
      return false;
    };
    if (lines.every(mcpOrJsonLine)) return '\n';
    return full;
  });
}

function trunc(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n… (${s.length - max} caracteres omitidos)`;
}

/** Uma linha tipo: mcp_Neon_run_sql "SELECT 1" ou mcp_Neon_list_projects */
export function parseMcpShellLine(line: string): { tool: string; args: string } | null {
  const m = line.trim().match(/^(mcp_[A-Za-z0-9_-]+)(?:\s+(.*))?$/);
  if (!m) return null;
  return { tool: m[1], args: m[2] ?? '' };
}

function extractStringArg(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/\\"/g, '"');
  }
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return t.slice(1, -1).replace(/\\'/g, "'");
  }
  if (/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|SHOW)\b/i.test(t)) {
    return t;
  }
  if (/^[a-zA-Z0-9_.-]+$/.test(t)) return t;
  return t;
}

/** neonctl / modelo: --project-id "x" --branch-id "y" --sql "SELECT 1" */
function neonFlagNameToJsonKey(flagRaw: string): string {
  const f = flagRaw.toLowerCase();
  if (f === 'project-id') return 'projectId';
  if (f === 'branch-id') return 'branchId';
  if (f === 'database-name' || f === 'database') return 'databaseName';
  return flagRaw.replace(/-([a-z])/gi, (_: string, c: string) => c.toUpperCase());
}

function readQuotedSegment(s: string, pos: number): { value: string; next: number } | null {
  const q = s[pos];
  if (q !== '"' && q !== "'") return null;
  let j = pos + 1;
  let buf = '';
  while (j < s.length) {
    if (s[j] === '\\' && j + 1 < s.length) {
      buf += s[j + 1];
      j += 2;
      continue;
    }
    if (s[j] === q) return { value: buf, next: j + 1 };
    buf += s[j];
    j++;
  }
  return { value: buf, next: j };
}

/**
 * Extrai flags estilo CLI a partir de uma string (linha bash ou valor errado em `sql`).
 */
function parseNeonCtlStyleFlags(argsRaw: string): Record<string, string> | null {
  const s = argsRaw.trim();
  if (!s || !/--[a-zA-Z]/.test(s)) return null;
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (!s.startsWith('--', i)) break;
    i += 2;
    const nameStart = i;
    while (i < s.length && /[a-zA-Z0-9-]/.test(s[i])) i++;
    const flagRaw = s.slice(nameStart, i);
    if (!flagRaw) break;
    while (i < s.length && /\s/.test(s[i])) i++;
    let value = '';
    if (i < s.length && s[i] === '=') {
      i++;
      while (i < s.length && /\s/.test(s[i])) i++;
    }
    if (i >= s.length) {
      out[neonFlagNameToJsonKey(flagRaw)] = value;
      break;
    }
    const quoted = readQuotedSegment(s, i);
    if (quoted) {
      value = quoted.value;
      i = quoted.next;
    } else {
      const us = i;
      while (i < s.length) {
        if (/\s/.test(s[i])) break;
        if (s.startsWith('--', i)) break;
        i++;
      }
      value = s.slice(us, i);
    }
    out[neonFlagNameToJsonKey(flagRaw)] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function alignNeonRunSqlArgsToSchema(
  parsed: Record<string, string>,
  schemaKeys: string[]
): Record<string, string> {
  const keys = new Set(schemaKeys);
  const out: Record<string, string> = {};
  const trySet = (schemaKey: string, val: string | undefined) => {
    if (!val || val.trim() === '') return;
    if (keys.has(schemaKey)) out[schemaKey] = val;
  };
  trySet('projectId', parsed.projectId);
  trySet('project_id', parsed.projectId);
  trySet('branchId', parsed.branchId);
  trySet('branch_id', parsed.branchId);
  trySet('sql', parsed.sql);
  trySet('query', parsed.query);
  trySet('databaseName', parsed.databaseName);
  trySet('database', parsed.databaseName);
  return out;
}

function fixRunSqlJsonObject(resolvedTool: string, jo: Record<string, unknown>): Record<string, string> | null {
  if (!/_run_sql$/i.test(resolvedTool)) return null;
  const sqlField = jo.sql;
  if (typeof sqlField !== 'string' || !/--(project-id|branch-id)\b/.test(sqlField)) return null;
  const merged = parseNeonCtlStyleFlags(sqlField.trim());
  if (!merged || !merged.sql?.trim()) return null;
  const schemaKeys = getMcpToolParameterKeys(resolvedTool);
  const keySet = new Set(schemaKeys);
  let aligned = alignNeonRunSqlArgsToSchema(merged, schemaKeys);
  for (const [k, v] of Object.entries(jo)) {
    if (k === 'sql') continue;
    if (typeof v === 'string' && v.trim() && keySet.has(k)) {
      aligned = { ...aligned, [k]: v };
    }
  }
  return Object.keys(aligned).length > 0 ? aligned : null;
}

function buildJsonArgsString(resolvedTool: string, argsRaw: string): string {
  const t = argsRaw.trim();
  if (!t) return '{}';
  try {
    const j = JSON.parse(t) as unknown;
    if (j !== null && typeof j === 'object' && !Array.isArray(j)) {
      const jo = j as Record<string, unknown>;
      const fixedObj = fixRunSqlJsonObject(resolvedTool, jo);
      if (fixedObj) return JSON.stringify(fixedObj);
      return JSON.stringify(j);
    }
  } catch {
    // continua
  }

  if (/_run_sql$/i.test(resolvedTool)) {
    const merged = parseNeonCtlStyleFlags(t);
    if (merged) {
      const keys = getMcpToolParameterKeys(resolvedTool);
      const aligned = alignNeonRunSqlArgsToSchema(merged, keys);
      if (Object.keys(aligned).length > 0) return JSON.stringify(aligned);
    }
  }

  const keys = getMcpToolParameterKeys(resolvedTool);
  const unq = extractStringArg(t);
  if (unq !== null) {
    if (keys.includes('sql')) return JSON.stringify({ sql: unq });
    if (keys.includes('query')) return JSON.stringify({ query: unq });
    if (keys.includes('project_id')) return JSON.stringify({ project_id: unq });
    if (keys.includes('projectId')) return JSON.stringify({ projectId: unq });
    if (keys.length === 1) return JSON.stringify({ [keys[0]]: unq });
  }
  return '{}';
}

function resolveToolName(requested: string, argsRaw: string, registered: Set<string>): string | null {
  if (registered.has(requested)) return requested;
  const underscored = requested.replace(/-/g, '_');
  if (registered.has(underscored)) return underscored;
  const rl = requested.toLowerCase();
  for (const n of registered) {
    if (n.toLowerCase() === rl) return n;
    if (n.replace(/-/g, '_').toLowerCase() === underscored.toLowerCase()) return n;
  }

  const arg = extractStringArg(argsRaw);
  const looksSql =
    arg !== null && /^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|SHOW)\b/i.test(arg);
  if (looksSql || /neon.*postgres.*execute|postgres.*execute/i.test(requested)) {
    const runSqls = [...registered].filter((n) => /_run_sql$/i.test(n));
    if (runSqls.length === 1) return runSqls[0];
    if (runSqls.length > 1) {
      const neon = runSqls.find((n) => /neon/i.test(n));
      return neon ?? runSqls[0];
    }
  }

  return null;
}

function collectInvocationsFromMarkdown(content: string): { tool: string; args: string }[] {
  if (getMcpExposedToolNames().length === 0) return [];

  const out: { tool: string; args: string }[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(BASH_BLOCK_RE.source, BASH_BLOCK_RE.flags);
  while ((m = re.exec(content)) !== null) {
    const body = m[1] ?? '';
    for (const line of body.split('\n')) {
      const parsed = parseMcpShellLine(line);
      if (!parsed) continue;
      const key = `${parsed.tool}|${parsed.args}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(parsed);
    }
  }
  return out;
}

export async function runMcpFromBashMarkdown(
  content: string,
  options?: { skipDuplicateAppendix?: boolean }
): Promise<{
  invocationCount: number;
  executedCount: number;
  augmentedAssistantText: string;
}> {
  const invocations = collectInvocationsFromMarkdown(content);
  if (invocations.length === 0) {
    return { invocationCount: 0, executedCount: 0, augmentedAssistantText: content };
  }

  const registered = new Set(getMcpExposedToolNames());
  const sections: string[] = [];
  let executedCount = 0;
  const verbose = mcpBashFallbackVerbose();

  for (const inv of invocations) {
    const resolved = resolveToolName(inv.tool, inv.args, registered);
    if (!resolved) {
      sections.push(`\n### ${inv.tool}\n_Ferramenta não encontrada nos MCPs conectados._`);
      continue;
    }
    const jsonArgs = buildJsonArgsString(resolved, inv.args);
    if (verbose) {
      console.log(ui.warn(`\n[MCP · texto/bash] ${resolved}`));
      console.log(ui.dim(jsonArgs.length > 220 ? `${jsonArgs.slice(0, 220)}…` : jsonArgs));
    } else {
      console.log(ui.dim(`[MCP] ${resolved} (fallback bash)`));
    }
    const result = await callMcpTool(resolved, jsonArgs);
    executedCount++;
    sections.push(`\n### ${resolved}\n\`\`\`text\n${trunc(result, 12000)}\n\`\`\``);
  }

  const appendixBody = sections.join('\n');
  const alreadyHasMcpSection =
    options?.skipDuplicateAppendix === true &&
    /\n##\s+Resultados\s+MCP\b/i.test(content);
  const appendix = alreadyHasMcpSection
    ? ''
    : '\n\n---\n## Resultados MCP (fallback bash — Pokt CLI)\n' + appendixBody;

  return {
    invocationCount: invocations.length,
    executedCount,
    augmentedAssistantText: content + appendix,
  };
}

function lastUserPlainText(messages: Array<{ role: string; content?: unknown }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const c = m.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .map((part: unknown) =>
          typeof part === 'object' && part != null && 'text' in part ? (part as { text: string }).text : String(part)
        )
        .join('');
    }
  }
  return '';
}

/**
 * Quando o modelo devolve vazio e o pedido parece “listar bancos”, executa mcp_*_run_sql uma vez.
 */
export async function tryAutoMcpForListDatabases(
  messages: Array<{ role: string; content?: unknown }>
): Promise<string | null> {
  const text = lastUserPlainText(messages);
  if (
    !/\b(bancos?\s+de\s+dados|banco\s+de\s+dados|listar.*bancos?|quais\s+bancos|databases?\b|postgresql|postgres|neon|\bmcp\b)\b/i.test(
      text
    )
  ) {
    return null;
  }
  const runSqls = getMcpExposedToolNames().filter((n) => /_run_sql$/i.test(n));
  if (runSqls.length === 0) return null;
  const tool = runSqls.find((n) => /neon/i.test(n)) ?? runSqls[0];
  const sql = 'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1;';
  if (mcpBashFallbackVerbose()) {
    console.log(ui.warn(`\n[MCP · automático] ${tool} — listando bancos (modelo sem resposta útil)`));
  } else {
    console.log(ui.dim(`[MCP] ${tool} (automático — listar bancos)`));
  }
  const out = await callMcpTool(tool, JSON.stringify({ sql }));
  return `## Bancos de dados (Postgres)\n\n**Ferramenta:** \`${tool}\`\n\n\`\`\`text\n${trunc(out, 12000)}\n\`\`\`\n\n_A automação do Pokt executou esta consulta porque o pedido parecia listar bancos e o modelo não retornou conteúdo._`;
}
