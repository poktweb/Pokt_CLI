import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions.js';

type PersistedMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string };

function toPersisted(messages: ChatCompletionMessageParam[]): PersistedMessage[] {
  return messages
    .filter((m): m is ChatCompletionMessageParam => !!m && typeof m === 'object' && 'role' in m)
    .map((m) => {
      const role = (m as any).role as PersistedMessage['role'];
      const content = (m as any).content;
      if (typeof content === 'string') return { role, content };
      if (Array.isArray(content)) {
        const text = content
          .map((part: any) => (part && typeof part === 'object' && 'text' in part ? String(part.text) : String(part)))
          .join('');
        return { role, content: text };
      }
      return { role, content: content != null ? String(content) : '' };
    });
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function safeTag(tag: string): string {
  return tag.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80);
}

export function getProjectHash(cwd: string = process.cwd()): string {
  const h = crypto.createHash('sha1');
  h.update(path.resolve(cwd));
  return h.digest('hex').slice(0, 12);
}

export function getSessionsDir(): string {
  // compatível Windows/mac/linux
  const base = path.join(os.homedir(), '.pokt', 'tmp');
  const proj = getProjectHash();
  const dir = path.join(base, proj);
  ensureDir(dir);
  return dir;
}

function getAutoPath(): string {
  return path.join(getSessionsDir(), 'auto.json');
}

export function saveAuto(messages: ChatCompletionMessageParam[]) {
  const payload = {
    updatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    messages: toPersisted(messages),
  };
  fs.writeFileSync(getAutoPath(), JSON.stringify(payload, null, 2), 'utf8');
}

export function loadAuto(): PersistedMessage[] | null {
  try {
    const raw = fs.readFileSync(getAutoPath(), 'utf8');
    const parsed = JSON.parse(raw) as { messages?: PersistedMessage[] };
    return Array.isArray(parsed?.messages) ? parsed.messages : null;
  } catch {
    return null;
  }
}

function tagPath(tag: string): string {
  return path.join(getSessionsDir(), `checkpoint.${safeTag(tag)}.json`);
}

export function listCheckpoints(): Array<{ tag: string; updatedAt?: string }> {
  const dir = getSessionsDir();
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('checkpoint.') && f.endsWith('.json'));
  return files
    .map((f) => {
      const tag = f.replace(/^checkpoint\./, '').replace(/\.json$/, '');
      try {
        const raw = fs.readFileSync(path.join(dir, f), 'utf8');
        const parsed = JSON.parse(raw) as { updatedAt?: string };
        return { tag, updatedAt: parsed.updatedAt };
      } catch {
        return { tag };
      }
    })
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

export function saveCheckpoint(tag: string, messages: ChatCompletionMessageParam[]) {
  const t = safeTag(tag);
  if (!t) throw new Error('Tag inválida.');
  const payload = {
    tag: t,
    updatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    messages: toPersisted(messages),
  };
  fs.writeFileSync(tagPath(t), JSON.stringify(payload, null, 2), 'utf8');
}

export function loadCheckpoint(tag: string): PersistedMessage[] {
  const t = safeTag(tag);
  const raw = fs.readFileSync(tagPath(t), 'utf8');
  const parsed = JSON.parse(raw) as { messages?: PersistedMessage[] };
  if (!Array.isArray(parsed?.messages)) throw new Error('Checkpoint inválido.');
  return parsed.messages;
}

export function deleteCheckpoint(tag: string) {
  const t = safeTag(tag);
  fs.unlinkSync(tagPath(t));
}

export function exportConversation(filename: string, messages: ChatCompletionMessageParam[]) {
  const out = path.isAbsolute(filename) ? filename : path.join(process.cwd(), filename);
  const ext = path.extname(out).toLowerCase();
  if (ext === '.json') {
    fs.writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), messages: toPersisted(messages) }, null, 2), 'utf8');
    return out;
  }
  // markdown
  const md = toPersisted(messages)
    .filter((m) => m.role !== 'system')
    .map((m) => `## ${m.role}\n\n${m.content}\n`)
    .join('\n');
  fs.writeFileSync(out, `# Pokt CLI chat export\n\nExportado em: ${new Date().toISOString()}\n\n${md}`, 'utf8');
  return out;
}

