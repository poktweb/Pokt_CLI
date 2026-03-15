#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { configCommand } from '../commands/config.js';
import { modelsCommand } from '../commands/models.js';
import { chatCommand } from '../commands/chat.js';

yargs(hideBin(process.argv))
  .scriptName('pokt')
  .usage('$0 <cmd> [args]')
  .command(configCommand)
  .command(modelsCommand)
  .command(chatCommand)
  .demandCommand(1, 'You need at least one command before moving on')
  .help()
  .parse();
