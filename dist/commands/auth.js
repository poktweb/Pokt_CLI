import { loginWithGoogle } from '../auth/google.js';
export const authCommand = {
    command: 'auth <action>',
    describe: 'Manage authentication',
    builder: (yargs) => yargs
        .positional('action', {
        describe: 'Action to perform',
        type: 'string',
        choices: ['login-google']
    }),
    handler: async (argv) => {
        if (argv.action === 'login-google') {
            await loginWithGoogle();
        }
    }
};
