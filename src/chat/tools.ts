import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import chalk from 'chalk';
import * as diff from 'diff';

const execAsync = promisify(exec);

/** Máximo de linhas de diff exibidas; além disso mostra resumo para não imprimir arquivo inteiro */
const MAX_DIFF_LINES = 45;

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
        contextToShow.forEach((l, idx) => {
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
        contextToShow.forEach((l, idx) => {
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

export const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
      name: 'write_file',
      description: 'Writes content to a file. Overwrites if exists, creates if not.',
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
    
    if (name === 'write_file') {
      const filePath = path.resolve(process.cwd(), args.path);
      const oldContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, args.content, 'utf8');
      
      showDiff(filePath, oldContent, args.content);
      
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
