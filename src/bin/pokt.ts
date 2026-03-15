#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { configCommand } from '../commands/config.js';
import { modelsCommand } from '../commands/models.js';
import { chatCommand } from '../commands/chat.js';
import { providerCommand } from '../commands/provider.js';
import { mcpCommand } from '../commands/mcp.js';
import prompts from 'prompts';
import chalk from 'chalk';
import { ui } from '../ui.js';

const argv = hideBin(process.argv);

if (argv.length === 0) {
  showMenu();
} else {
  yargs(argv)
    .scriptName('pokt')
    .usage('$0 <cmd> [args]')
    .command(configCommand)
    .command(modelsCommand)
    .command(chatCommand)
    .command(providerCommand)
    .command(mcpCommand)
    .demandCommand(1, 'You need at least one command before moving on')
    .help()
    .parse();
}

async function showMenu() {
  const { getEffectiveActiveModel, PROVIDER_LABELS } = await import('../config.js');
  const active = getEffectiveActiveModel();
  const providerLabel = active ? (PROVIDER_LABELS[active.provider] ?? active.provider) : 'No provider';

  console.log('');
  console.log(ui.banner());
  console.log(ui.statusLine(providerLabel));
  console.log('');
  console.log(ui.separator());
  console.log('');

  const response = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: '💬 Start Chat (Vibe Coding)', value: 'chat' },
      { title: '🤖 Select AI Model', value: 'models' },
      { title: '➕ Add / sync models', value: 'add-models' },
      { title: '🏠 Switch API Provider (casa de API)', value: 'provider' },
      { title: '🔌 MCP Servers (tools externos)', value: 'mcp' },
      { title: '⚙️  Configure API Keys / Tokens', value: 'config' },
      { title: '❌ Exit', value: 'exit' }
    ]
  });

  if (!response.action || response.action === 'exit') {
    process.exit(0);
  }

  if (response.action === 'chat') {
    const { chatCommand } = await import('../commands/chat.js');
    (chatCommand.handler as Function)({ fromMenu: true });
  } else if (response.action === 'models') {
    await handleModelsMenu();
  } else if (response.action === 'add-models') {
    await handleAddModelsMenu();
  } else if (response.action === 'provider') {
    await handleProviderMenu();
  } else if (response.action === 'config') {
    await handleConfigMenu();
  } else if (response.action === 'mcp') {
    const { mcpCommand } = await import('../commands/mcp.js');
    await (mcpCommand.handler as Function)({ action: 'list' });
    const mcpResp = await prompts({
      type: 'select',
      name: 'mcpAction',
      message: 'MCP:',
      choices: [
        { title: '🧪 Test connection', value: 'test' },
        { title: '🔙 Back', value: 'back' }
      ]
    });
    if (mcpResp.mcpAction === 'back') return showMenu();
    await (mcpCommand.handler as Function)({ action: mcpResp.mcpAction });
    return showMenu();
  }
}

async function handleModelsMenu(providerFilter?: string) {
  const { config, getEffectiveActiveModel, PROVIDER_LABELS, ALL_PROVIDERS } = await import('../config.js');
  let allModels = config.get('registeredModels');
  if (!Array.isArray(allModels)) {
    const defaults = [
      { provider: 'openrouter' as const, id: 'google/gemini-2.0-flash-001' },
      { provider: 'ollama' as const, id: 'llama3' }
    ];
    config.set('registeredModels', defaults);
    allModels = defaults;
  }
  const active = getEffectiveActiveModel();

  // Primeira tela: escolher categoria (provedor)
  if (providerFilter === undefined) {
    const categoryChoices = [
      ...(ALL_PROVIDERS as readonly string[]).map(p => ({
        title: `${active?.provider === p ? '★ ' : ''}${PROVIDER_LABELS[p as keyof typeof PROVIDER_LABELS] || p}`,
        value: p
      })),
      { title: '➕ Add / sync models', value: 'go-add-models' as const },
      { title: '🔙 Back', value: 'back' as const }
    ];
    const cat = await prompts({
      type: 'select',
      name: 'category',
      message: 'Select category (provider):',
      choices: categoryChoices
    });
    if (cat.category === 'back') return showMenu();
    if (cat.category === 'go-add-models') return handleAddModelsMenu();
    return handleModelsMenu(cat.category as string);
  }

  // Segunda tela: listar modelos da categoria escolhida
  const providerModels = allModels.filter((m: { provider: string }) => m.provider === providerFilter);
  const label = PROVIDER_LABELS[providerFilter as keyof typeof PROVIDER_LABELS] || providerFilter;

  const choices = [
    ...providerModels.map((m: { id: string; provider: string }, i: number) => ({
      title: `${active?.id === m.id && active?.provider === m.provider ? '★ ' : ''}${m.id}`,
      value: i
    })),
    ...(providerModels.length === 0
      ? [{ title: '➕ Nenhum modelo — ir para Add / sync models', value: 'go-add-models' as const }]
      : []),
    { title: '🔙 Back to categories', value: 'back-categories' as const }
  ];

  const response = await prompts({
    type: 'select',
    name: 'modelIdx',
    message: `${label} — choose a model:`,
    choices
  });

  if (response.modelIdx === 'back-categories') return handleModelsMenu();
  if (response.modelIdx === 'go-add-models') return handleAddModelsMenu();

  if (typeof response.modelIdx === 'number') {
    const selected = providerModels[response.modelIdx];
    config.set('activeModel', selected);
    console.log(ui.success(`Active model set to [${selected.provider}] ${selected.id}\n`));
    return showMenu();
  }
}

/** Menu para adicionar/sincronizar modelos: OpenRouter (API), Ollama local (GET /api/tags), Ollama Cloud (add por ID). */
async function handleAddModelsMenu() {
  const response = await prompts({
    type: 'select',
    name: 'action',
    message: 'Add or sync models from which provider?',
    choices: [
      { title: 'OpenRouter — sync all from API', value: 'fetch-openrouter' },
      { title: 'Ollama (local) — sync from your Ollama (list models)', value: 'fetch-ollama' },
      { title: 'Ollama Cloud — sync from API', value: 'fetch-ollama-cloud' },
      { title: 'OpenRouter — add model by ID', value: 'add-openrouter' },
      { title: 'Ollama (local) — add model by ID', value: 'add-ollama' },
      { title: 'Ollama Cloud — add model by ID', value: 'add-ollama-cloud' },
      { title: '🔙 Back', value: 'back' }
    ]
  });

  if (response.action === 'back') return showMenu();

  const addActions = ['add-openrouter', 'add-ollama', 'add-ollama-cloud'] as const;
  if (addActions.includes(response.action as any)) {
    const idPrompt = await prompts({
      type: 'text',
      name: 'id',
      message: response.action === 'add-openrouter'
        ? 'Model ID (ex: google/gemini-2.5-flash):'
        : 'Model ID (ex: llama3):'
    });
    const id = typeof idPrompt.id === 'string' ? idPrompt.id.trim() : '';
    if (id) {
      const { modelsCommand } = await import('../commands/models.js');
      await (modelsCommand.handler as Function)({ action: response.action, id });
    } else {
      console.log(ui.warn('No ID entered.'));
    }
    return handleAddModelsMenu();
  }

  const { modelsCommand } = await import('../commands/models.js');
  await (modelsCommand.handler as Function)({ action: response.action });
  return handleAddModelsMenu();
}

async function handleConfigMenu() {
  const { config } = await import('../config.js');
  
  const response = await prompts({
    type: 'select',
    name: 'type',
    message: 'Which setting to configure?',
    choices: [
      { title: 'View current config', value: 'show' },
      { title: 'Pokt Token (do painel — só isso para usar Controller)', value: 'set-pokt-token' },
      { title: 'OpenRouter Token', value: 'set-openrouter' },
      { title: 'Gemini API Key', value: 'set-gemini' },
      { title: 'Ollama Base URL (local)', value: 'set-ollama' },
      { title: 'Ollama Cloud API Key', value: 'set-ollama-cloud' },
      { title: '🔙 Back', value: 'back' }
    ]
  });

  if (response.type === 'back') return showMenu();
  if (response.type === 'show') {
    const { getControllerBaseUrl } = await import('../config.js');
    const openrouter = config.get('openrouterToken');
    const gemini = config.get('geminiApiKey');
    const ollama = config.get('ollamaBaseUrl');
    const ollamaCloud = config.get('ollamaCloudApiKey');
    const poktToken = config.get('poktToken');
    console.log(chalk.blue('\nCurrent config (tokens masked):'));
    console.log(ui.dim('  Controller URL:'), getControllerBaseUrl(), ui.dim('(já configurado)'));
    console.log(ui.dim('  Pokt Token:'), poktToken ? poktToken.slice(0, 10) + '****' : '(not set)');
    console.log(ui.dim('  OpenRouter Token:'), openrouter ? openrouter.slice(0, 8) + '****' : '(not set)');
    console.log(ui.dim('  Gemini API Key:'), gemini ? gemini.slice(0, 8) + '****' : '(not set)');
    console.log(ui.dim('  Ollama Base URL (local):'), ollama || '(not set)');
    console.log(ui.dim('  Ollama Cloud API Key:'), ollamaCloud ? ollamaCloud.slice(0, 8) + '****' : '(not set)');
    console.log(ui.warn('\nTokens are stored in your user config directory. Do not share it.\n'));
    return handleConfigMenu();
  }

  const msg = response.type === 'set-pokt-token'
    ? 'Token gerado no painel (pk_...):'
    : `Enter the value for ${response.type}:`;

  const valueResponse = await prompts({
    type: 'text',
    name: 'val',
    message: msg
  });

  if (valueResponse.val) {
    const keyMap: Record<string, string> = {
      'set-gemini': 'geminiApiKey',
      'set-openrouter': 'openrouterToken',
      'set-ollama': 'ollamaBaseUrl',
      'set-ollama-cloud': 'ollamaCloudApiKey',
      'set-pokt-token': 'poktToken'
    };
    const key = keyMap[response.type];
    config.set(key as string, key === 'ollamaBaseUrl' ? (valueResponse.val as string).replace(/\/$/, '') : valueResponse.val);
    if (key === 'poktToken') {
      const controllerModel = { provider: 'controller', id: 'default' };
      const models = config.get('registeredModels');
      if (!models.some((m: { provider: string; id: string }) => m.provider === 'controller' && m.id === 'default')) {
        config.set('registeredModels', [controllerModel, ...models]);
      }
      config.set('activeModel', controllerModel);
    }
    console.log(ui.success('Config updated.\n'));
  }

  return handleConfigMenu();
}

async function handleProviderMenu() {
  const { config, getEffectiveActiveModel, PROVIDER_LABELS, ALL_PROVIDERS } = await import('../config.js');
  let models = config.get('registeredModels');
  const hasControllerUrl = !!(config.get('controllerBaseUrl'));
  const hasPoktToken = !!(config.get('poktToken'));
  if ((hasControllerUrl || hasPoktToken) && !models.some(m => m.provider === 'controller')) {
    models = [{ provider: 'controller', id: 'default' }, ...models];
    config.set('registeredModels', models);
  }
  const active = getEffectiveActiveModel();
  // Mostra todos os provedores (Ollama, Gemini, OpenRouter, Controller e quaisquer outros futuros)
  const choices = (ALL_PROVIDERS as readonly string[]).map(p => ({
    title: `${active?.provider === p ? '★ ' : ''}${PROVIDER_LABELS[p as keyof typeof PROVIDER_LABELS] || p}`,
    value: p
  }));
  const response = await prompts({
    type: 'select',
    name: 'provider',
    message: 'Choose API provider (casa de API):',
    choices: [...choices, { title: '🔙 Back', value: 'back' }]
  });
  if (response.provider === 'back') return showMenu();

  const currentActive = getEffectiveActiveModel();
  const model = (currentActive?.provider === response.provider)
    ? currentActive
    : models.find(m => m.provider === response.provider);

  if (model) {
    config.set('activeModel', model);
    const label = (PROVIDER_LABELS as Record<string, string>)[response.provider] || response.provider;
    console.log(ui.success(`Primary provider set to ${label}.\n`));
  } else {
    if (response.provider === 'controller') {
      console.log(ui.error('Controller model not found. Add it with: pokt config set-pokt-token -v <token>'));
    } else if (response.provider === 'openrouter') {
      console.log(ui.error('No OpenRouter model. Run: pokt models fetch-openrouter then pokt models list'));
    } else {
      console.log(ui.error(`No model for provider "${response.provider}". Run: pokt models list and add one.`));
    }
  }
  return showMenu();
}
