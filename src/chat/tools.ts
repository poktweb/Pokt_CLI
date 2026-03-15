import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import chalk from 'chalk';
import * as diff from 'diff';

const execAsync = promisify(exec);

function showDiff(filePath: string, oldContent: string, newContent: string) {
  const relativePath = path.relative(process.cwd(), filePath);
  console.log(chalk.blue.bold(`\n📝 Edit ${relativePath}:`));
  
  if (!oldContent) {
    console.log(chalk.green(`  (New file created with ${newContent.split('\n').length} lines)`));
    return;
  }

  const changes = diff.diffLines(oldContent, newContent);
  const CONTEXT_LINES = 3;
  
  let currentLine = 1;

  for (let i = 0; i < changes.length; i++) {
    const part = changes[i];
    const lines = part.value.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();

    if (part.added || part.removed) {
      // Show some context from previous part if it was unchanged
      if (i > 0 && !changes[i-1].added && !changes[i-1].removed) {
        const prevLines = changes[i-1].value.split('\n');
        if (prevLines[prevLines.length - 1] === '') prevLines.pop();
        const contextToShow = prevLines.slice(-CONTEXT_LINES);
        const startLine = currentLine - contextToShow.length;
        contextToShow.forEach((l, idx) => {
          console.log(`${chalk.gray((startLine + idx).toString().padStart(3))}   ${chalk.gray(l)}`);
        });
      }

      // Show the actual change
      lines.forEach((line) => {
        const lineDisplay = part.added ? chalk.green(line) : chalk.red(line);
        const symbolDisplay = part.added ? chalk.green('+') : chalk.red('-');
        console.log(`${chalk.gray(currentLine.toString().padStart(3))} ${symbolDisplay} ${lineDisplay}`);
        if (!part.removed) currentLine++;
      });

      // Show some context from next part if it is unchanged
      if (i < changes.length - 1 && !changes[i+1].added && !changes[i+1].removed) {
        const nextLines = changes[i+1].value.split('\n');
        if (nextLines[nextLines.length - 1] === '') nextLines.pop();
        const contextToShow = nextLines.slice(0, CONTEXT_LINES);
        contextToShow.forEach((l, idx) => {
          console.log(`${chalk.gray((currentLine + idx).toString().padStart(3))}   ${chalk.gray(l)}`);
        });
        console.log(chalk.gray('  ...'));
      }
    } else {
      // Unchanged part, just update the line counter
      currentLine += lines.length;
    }
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
