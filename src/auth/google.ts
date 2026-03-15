import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import url from 'url';
import open from 'open';
import { config } from '../config.js';
import chalk from 'chalk';
import ora from 'ora';

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

export async function loginWithGoogle() {
  const clientId = config.get('googleClientId');
  const clientSecret = config.get('googleClientSecret');

  if (!clientId || !clientSecret) {
    console.log(chalk.red('\nError: Google OAuth Client ID or Secret not configured.'));
    console.log(chalk.yellow('To use Google Login, follow these steps:'));
    console.log(chalk.gray('1. Create a project at: https://console.cloud.google.com/'));
    console.log(chalk.gray('2. Enable the "Generative Language API"'));
    console.log(chalk.gray('3. Create OAuth 2.0 Client ID (Type: Web application)'));
    console.log(chalk.gray(`4. Add Authorized redirect URI: ${REDIRECT_URI}`));
    console.log(chalk.yellow('\nThen configure Pokt CLI:'));
    console.log(chalk.cyan(`   pokt config set-google-client-id -v YOUR_CLIENT_ID`));
    console.log(chalk.cyan(`   pokt config set-google-client-secret -v YOUR_CLIENT_SECRET`));
    return;
  }

  const spinner = ora('Starting Google Login...').start();
  const oAuth2Client = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/generative-language'],
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url && req.url.includes('/oauth2callback') && req.url.includes('code=')) {
        const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
        const code = qs.get('code');
        res.end('Authentication successful! You can close this tab.');
        server.close();

        const { tokens } = await oAuth2Client.getToken(code as string);
        config.set('googleToken', tokens);
        console.log(chalk.green('\n✔ Google account connected successfully.'));
      }
    } catch (e: any) {
      console.error(chalk.red(`\nAuthentication failed: ${e.message}`));
      res.end('Authentication failed.');
    }
  }).listen(3000);

  spinner.succeed(chalk.blue('Opening browser for Google login...'));
  await open(authorizeUrl);
}
