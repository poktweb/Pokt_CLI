import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions.js';
import chalk from 'chalk';
import * as diff from 'diff';

const execAsync = promisify(exec);

/** Máximo de linhas de diff exibidas; além disso mostra resumo para não imprimir arquivo inteiro */
const MAX_DIFF_LINES = 45;

function isGeneratedNoisePath(relPath: string): boolean {
  const base = path.basename(relPath);
  return /^generated\.(text|json)$/i.test(base);
}

function looksLikeMcpJsonDump(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  try {
    const j = JSON.parse(t) as unknown;
    if (j !== null && typeof j === 'object' && !Array.isArray(j)) {
      const o = j as Record<string, unknown>;
      return 'success' in o && 'result' in o;
    }
    if (Array.isArray(j) && j.length > 0 && j.every((x) => x && typeof x === 'object')) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * When exact old_string is not found, try to find a similar region and return helpful error.
 * Inspired by gemini-cli fuzzy matcher fallback.
 */
function findClosestMatchAndBuildError(
  fileContent: string,
  oldString: string,
  filePath: string
): string {
  const oldLines = oldString.split('\n').filter((l) => l.trim().length > 0);
  if (oldLines.length === 0) {
    return `search_replace failed: old_string is empty or only whitespace.`;
  }
  const firstLine = oldLines[0];
  const idx = fileContent.indexOf(firstLine);
  if (idx >= 0) {
    const start = Math.max(0, idx - 200);
    const end = Math.min(fileContent.length, idx + firstLine.length + 400);
    const snippet = fileContent.slice(start, end);
    const diffResult = diff.diffLines(oldString, snippet);
    const diffPreview = diffResult
      .slice(0, 8)
      .map((p: { added?: boolean; removed?: boolean; value: string }) => (p.added ? `+${p.value}` : p.removed ? `-${p.value}` : ` ${p.value}`))
      .join('')
      .slice(0, 600);
    return `search_replace failed: old_string not found exactly. First line was found at position ${idx}. Suggestion: check whitespace, indentation, line endings. Diff (expected vs file snippet):\n${diffPreview}\n\nCall read_file to see full content and retry with exact match.`;
  }
  const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  const normOld = norm(oldString);
  const fileLines = fileContent.split('\n');
  let bestLineIdx = -1;
  let bestLen = 0;
  for (let i = 0; i < fileLines.length; i++) {
    const lineNorm = norm(fileLines[i]);
    if (lineNorm.length < 10) continue;
    let matchLen = 0;
    for (let j = 0; j < Math.min(lineNorm.length, normOld.length); j++) {
      if (lineNorm[j] === normOld[j]) matchLen++;
      else break;
    }
    if (matchLen > bestLen && matchLen >= 15) {
      bestLen = matchLen;
      bestLineIdx = i;
    }
  }
  if (bestLineIdx >= 0) {
    const ctx = fileLines.slice(Math.max(0, bestLineIdx - 2), bestLineIdx + 4).join('\n');
    return `search_replace failed: old_string not found. Closest region (line ${bestLineIdx + 1}):\n---\n${ctx}\n---\nUse read_file("${filePath}") and retry with exact content including indentation and newlines.`;
  }
  return `search_replace failed: old_string not found in ${filePath}. Use read_file to get current content and ensure old_string matches exactly (whitespace, tabs, newlines).`;
}

function showDiff(filePath: string, oldContent: string, newContent: string) {
  const relativePath = path.relative(process.cwd(), filePath);
  console.log(chalk.blue.bold(`\n📝 Edit ${relativePath}:`));
  
  if (!oldContent) {
    const lineCount = newContent.split('\n').length;
    if (lineCount <= MAX_DIFF_LINES) {
      newContent.split('\n').forEach((line, idx) => {
        console.log(`${chalk.gray((idx + 1).toString().padStart(3))} ${chalk.green('+')} ${chalk.green(line)}`);
      });
    } else {
      newContent.split('\n').slice(0, MAX_DIFF_LINES).forEach((line, idx) => {
        console.log(`${chalk.gray((idx + 1).toString().padStart(3))} ${chalk.green('+')} ${chalk.green(line)}`);
      });
      console.log(chalk.gray(`  ... (and ${lineCount - MAX_DIFF_LINES} more lines)`));
    }
    console.log('');
    return;
  }

  const changes = diff.diffLines(oldContent, newContent);
  const CONTEXT_LINES = 3;
  let currentLine = 1;
  let linesPrinted = 0;

  for (let i = 0; i < changes.length && linesPrinted < MAX_DIFF_LINES; i++) {
    const part = changes[i];
    const lines = part.value.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();

    if (part.added || part.removed) {
      // Show some context from previous part if it was unchanged
      if (i > 0 && !changes[i-1].added && !changes[i-1].removed && linesPrinted < MAX_DIFF_LINES) {
        const prevLines = changes[i-1].value.split('\n');
        if (prevLines[prevLines.length - 1] === '') prevLines.pop();
        const contextToShow = prevLines.slice(-CONTEXT_LINES);
        const startLine = currentLine - contextToShow.length;
        contextToShow.forEach((l: string, idx: number) => {
          if (linesPrinted >= MAX_DIFF_LINES) return;
          console.log(`${chalk.gray((startLine + idx).toString().padStart(3))}   ${chalk.gray(l)}`);
          linesPrinted++;
        });
      }

      // Show the actual change (só até MAX_DIFF_LINES)
      for (const line of lines) {
        if (linesPrinted >= MAX_DIFF_LINES) break;
        const lineDisplay = part.added ? chalk.green(line) : chalk.red(line);
        const symbolDisplay = part.added ? chalk.green('+') : chalk.red('-');
        console.log(`${chalk.gray(currentLine.toString().padStart(3))} ${symbolDisplay} ${lineDisplay}`);
        if (!part.removed) currentLine++;
        linesPrinted++;
      }

      // Show some context from next part if it is unchanged
      if (i < changes.length - 1 && !changes[i+1].added && !changes[i+1].removed && linesPrinted < MAX_DIFF_LINES) {
        const nextLines = changes[i+1].value.split('\n');
        if (nextLines[nextLines.length - 1] === '') nextLines.pop();
        const contextToShow = nextLines.slice(0, CONTEXT_LINES);
        contextToShow.forEach((l: string, idx: number) => {
          if (linesPrinted >= MAX_DIFF_LINES) return;
          console.log(`${chalk.gray((currentLine + idx).toString().padStart(3))}   ${chalk.gray(l)}`);
          linesPrinted++;
        });
        if (linesPrinted < MAX_DIFF_LINES) console.log(chalk.gray('  ...'));
        linesPrinted++;
      }
    } else {
      currentLine += lines.length;
    }
  }

  if (linesPrinted >= MAX_DIFF_LINES) {
    console.log(chalk.gray(`  ... (diff truncated, more changes in file)`));
  }
  console.log('');
}

export const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Reads the contents of a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the file' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_replace',
      description:
        'Replaces old_string with new_string in a file. PREFERRED for edits and modifications: targeted, minimal changes. Use read_file first to get current content. For new files or complete rewrites use write_file. expected_replacements (optional): if set, fails when count of matches ≠ value (prevents unintended broad changes).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the file' },
          old_string: { type: 'string', description: 'Exact text to find and replace (must match file content including whitespace)' },
          new_string: { type: 'string', description: 'Replacement text' },
          expected_replacements: { type: 'number', description: 'Optional: fail if number of occurrences ≠ this (safety guard)' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Writes full content to a file. Overwrites if exists, creates if not. Use for new files or complete rewrites. For small edits, prefer search_replace. When modifying existing work from this chat, use the same path as before (see user message [Pokt] hint or prior tool calls); call read_file first if you need the current contents.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the file' },
          content: { type: 'string', description: 'The full content to write to the file' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Runs a shell command in the current directory.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to run' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Lists files and folders in a single directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Lists ALL files in the project recursively (ignores node_modules, .git, dist).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Root directory to start from (default ".")' }
        }
      }
    }
  }
];

export async function executeTool(name: string, argsStr: string): Promise<string> {
  try {
    const args = JSON.parse(argsStr);
    
    if (name === 'read_file') {
      return fs.readFileSync(path.resolve(process.cwd(), args.path), 'utf8');
    }

    if (name === 'search_replace') {
      const filePath = path.resolve(process.cwd(), args.path);
      if (!fs.existsSync(filePath)) {
        return `Error: File not found: ${args.path}. Use write_file to create it.`;
      }
      const content = fs.readFileSync(filePath, 'utf8');
      const oldStr = args.old_string ?? '';
      const newStr = args.new_string ?? '';
      if (oldStr === newStr) {
        return `search_replace: old_string and new_string are identical; no change made.`;
      }
      const expected = typeof args.expected_replacements === 'number' ? args.expected_replacements : undefined;
      const occurrences = content.split(oldStr).length - 1;
      if (occurrences === 0) {
        const errMsg = findClosestMatchAndBuildError(content, oldStr, args.path);
        return errMsg;
      }
      if (expected !== undefined && occurrences !== expected) {
        return `search_replace failed: found ${occurrences} occurrence(s) of old_string, but expected_replacements=${expected}. Adjust old_string to be unique or set expected_replacements to ${occurrences}.`;
      }
      const newContent = content.split(oldStr).join(newStr);
      fs.writeFileSync(filePath, newContent, 'utf8');
      const rel = path.relative(process.cwd(), filePath);
      if (!isGeneratedNoisePath(rel) || !looksLikeMcpJsonDump(newContent)) {
        showDiff(filePath, content, newContent);
      }
      return `Successfully applied search_replace to ${args.path} (${occurrences} replacement(s)).`;
    }
    
    if (name === 'write_file') {
      const filePath = path.resolve(process.cwd(), args.path);
      const oldContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, args.content, 'utf8');

      const rel = path.relative(process.cwd(), filePath);
      if (isGeneratedNoisePath(rel) && looksLikeMcpJsonDump(args.content)) {
        console.log(
          chalk.dim(`\n📝 ${rel} (omitido diff — parece resposta MCP/JSON; use tabela no texto do assistente)\n`)
        );
      } else {
        showDiff(filePath, oldContent, args.content);
      }
      
      return `Successfully wrote to ${args.path}`;
    }
    
    if (name === 'run_command') {
      const { stdout, stderr } = await execAsync(args.command, { cwd: process.cwd() });
      let out = '';
      if (stdout) out += `STDOUT:\n${stdout}\n`;
      if (stderr) out += `STDERR:\n${stderr}\n`;
      return out || 'Command executed successfully with no output.';
    }

    if (name === 'list_directory') {
      const dirPath = path.resolve(process.cwd(), args.path);
      const items = fs.readdirSync(dirPath);
      return items.join('\n');
    }

    if (name === 'list_files') {
      const root = path.resolve(process.cwd(), args.path || '.');
      const files: string[] = [];
      
      const walk = (dir: string) => {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          if (item === 'node_modules' || item === '.git' || item === 'dist') continue;
          
          if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
          } else {
            files.push(path.relative(process.cwd(), fullPath));
          }
        }
      };
      
      walk(root);
      return files.join('\n') || 'No files found.';
    }

    return `Unknown tool: ${name}`;
  } catch (error: any) {
    return `Error executing tool ${name}: ${error.message}`;
  }
}
