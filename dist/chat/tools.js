import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export const tools = [
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
            description: 'Lists files and folders in a directory.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Directory path to list' }
                },
                required: ['path']
            }
        }
    }
];
export async function executeTool(name, argsStr) {
    try {
        const args = JSON.parse(argsStr);
        if (name === 'read_file') {
            return fs.readFileSync(path.resolve(process.cwd(), args.path), 'utf8');
        }
        if (name === 'write_file') {
            const filePath = path.resolve(process.cwd(), args.path);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, args.content, 'utf8');
            return `Successfully wrote to ${args.path}`;
        }
        if (name === 'run_command') {
            const { stdout, stderr } = await execAsync(args.command, { cwd: process.cwd() });
            let out = '';
            if (stdout)
                out += `STDOUT:\n${stdout}\n`;
            if (stderr)
                out += `STDERR:\n${stderr}\n`;
            return out || 'Command executed successfully with no output.';
        }
        if (name === 'list_directory') {
            const dirPath = path.resolve(process.cwd(), args.path);
            const items = fs.readdirSync(dirPath);
            return items.join('\n');
        }
        return `Unknown tool: ${name}`;
    }
    catch (error) {
        return `Error executing tool ${name}: ${error.message}`;
    }
}
