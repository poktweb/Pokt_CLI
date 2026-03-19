# Pokt CLI

CLI de **Vibe Coding** com IA: OpenAI, Grok (xAI), OpenRouter, Ollama (local e cloud), Gemini e provedor Pokt (controller).

## Requisitos

- **Node.js** >= 18.0.0

## Instalação

```bash
# Instalação principal (global)
npm install -g pokt-cli

# Alternativa: usar sem instalar
npx pokt-cli
```

## Uso

Sem argumentos, o Pokt abre um menu interativo:

```bash
pokt
```

## Se o `pokt` não for reconhecido (Windows)

Se você instalou com `npm install -g pokt-cli` mas o PowerShell diz que `pokt` não existe, normalmente é **PATH do prefixo global do npm**.

```bash
# Veja onde o npm instala pacotes globais
npm config get prefix

# Verifique se o comando foi criado (PowerShell)
where pokt
```

- **Garanta no PATH**: adicione o `prefix` acima (geralmente algo como `%AppData%\\npm`) ao PATH do Windows.
- **Reinicie o terminal**: feche e abra o PowerShell/Terminal novamente.
- **Reinstale**: `npm uninstall -g pokt-cli && npm install -g pokt-cli`

Ou use os comandos diretamente:

```bash
pokt chat              # Iniciar chat (Vibe Coding)
pokt models list       # Listar modelos
pokt provider use openrouter
pokt config show
pokt --help
```

## Comandos

| Comando | Descrição |
|--------|-----------|
| `pokt` | Menu interativo |
| `pokt chat` | Iniciar sessão de chat com a IA |
| `pokt config <action>` | Configurar chaves e tokens |
| `pokt models <action>` | Gerenciar modelos (listar, adicionar, trocar) |
| `pokt provider use <provider>` | Trocar provedor de API |
| `pokt mcp [action]` | Gerenciar servidores MCP (ferramentas externas) |
| `pokt doctor` | Diagnóstico (credenciais + conectividade) |

### Config (`config`)

- `pokt config show` — Mostra a configuração atual (tokens mascarados).
- `pokt config set-openai -v <key>` — API key OpenAI.
- `pokt config set-grok -v <key>` — API key Grok (xAI).
- `pokt config set-openrouter -v <token>` — Token OpenRouter.
- `pokt config set-ollama -v <url>` — URL base do Ollama local.
- `pokt config set-ollama-cloud -v <key>` — API key Ollama Cloud.
- `pokt config set-gemini -v <key>` — API key Google Gemini.
- `pokt config set-pokt-token -v <token>` — Token Pokt (gerado no painel na Railway).
- `pokt config set-pokt-api-url -v <url>` — API com token Pokt (provider `controller`; padrão Railway). O provider **openai** continua em `api.openai.com`.
- `pokt config set-pro-portal-url -v <url>` — Painel / serviço (padrão Railway).
- `pokt config set-token-purchase-url -v <url>` — Só a página de **comprar token** (padrão: Controller Vercel).
- `pokt config clear-openrouter` — Remove o token OpenRouter.
- `pokt config clear-openai` — Remove a API key OpenAI.
- `pokt config clear-grok` — Remove a API key Grok (xAI).

### Modelos (`models`)

- `pokt models list` — Lista modelos registrados e o ativo.
- `pokt models fetch-openai` — Busca modelos disponíveis na OpenAI.
- `pokt models fetch-grok` — Busca modelos disponíveis no Grok (xAI).
- `pokt models fetch-openrouter` — Busca modelos disponíveis no OpenRouter.
- `pokt models fetch-ollama` — Busca modelos do Ollama local.
- `pokt models fetch-ollama-cloud` — Busca modelos do Ollama Cloud.
- `pokt models add-openai`, `add-grok`, `add-openrouter`, `add-ollama`, `add-ollama-cloud` — Adiciona modelo (use `-i <id>`).
- `pokt models use -i <id> -p <provider>` — Define o modelo ativo.

### Variáveis de ambiente (opcional)

Se preferir não salvar chaves no computador (ou para CI), você pode usar env vars. O Pokt prioriza env var e depois cai no `pokt config`.

- `OPENAI_API_KEY`
- `XAI_API_KEY` (ou `GROK_API_KEY`)
- `OPENROUTER_API_KEY` (ou `OPENROUTER_TOKEN`)
- `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`)
- `OLLAMA_BASE_URL`
- `OLLAMA_CLOUD_API_KEY`
- `POKT_TOKEN`
- `POKT_API_BASE_URL` — API com token Pokt (Railway por padrão).
- `POKT_PRO_PORTAL_URL` (ou `POKT_CONTROLLER_PORTAL_URL`) — Painel / serviço (Railway por padrão).
- `POKT_TOKEN_PURCHASE_URL` — Só checkout / compra de token (Vercel por padrão). Na atualização, URLs antigas `pokt-cli-controller.vercel.app` salvas em API/painel migram automaticamente para a Railway.

### Provedores (`provider`)

Provedores suportados: `controller` (Pokt), `openai`, `grok`, `openrouter`, `gemini`, `ollama`, `ollama-cloud`.

```bash
pokt provider use openai
pokt provider use grok
pokt provider use openrouter
pokt provider use ollama
```

### MCP por projeto (`pokt_cli/mcp.json`)

Na **raiz do seu repositório** (subindo pastas a partir do diretório atual), o Pokt procura uma pasta chamada **`pokt_cli`**, **`Pokt_CLI`**, **`Pot_cli`**, etc. (aceita essas variações, comparação sem diferenciar maiúsculas).

Dentro dela, o arquivo **`mcp.json`** define servidores MCP. O Pokt aceita a chave **`mcpServers`** (Cursor/Claude) ou **`servers`** (ex.: Neon e outros). Opcionalmente `mcp.servers` / `mcp.mcpServers`. O Pokt **mescla** isso com servidores **globais** (`pokt mcp add`); se o **mesmo nome** existir nos dois, vale o do **projeto**.

- `pokt mcp init` — cria `./pokt_cli/mcp.json` com exemplo (no diretório atual).
- `pokt mcp list` — mostra origem `[projeto]` / `[global]`.
- `pokt mcp test` — testa stdio e HTTP (Streamable HTTP ou `transport: "sse"`).
- `pokt mcp link -n <nome>` — para entradas HTTP com `"oauth": true`: abre o navegador, autoriza e grava tokens em `pokt_cli/.mcp-oauth/` (adicione `.mcp-oauth` ao `.gitignore` se não quiser versionar).

Em strings do JSON você pode usar **`${NOME_DA_VARIÁVEL}`** para ler variáveis de ambiente (ex.: tokens em `headers`).

No **chat**, as tools MCP aparecem com prefixo `mcp_`; a IA também pode usar `run_command` e `write_file` para scripts (Python, etc.) quando fizer sentido.

## Desenvolvimento

```bash
# Clonar e instalar
git clone https://github.com/PoktWeb/Pokt_CLI.git
cd Pokt_CLI
npm install

# Desenvolvimento (executa o TypeScript direto)
npm run dev

# Build
npm run build

# Executar após o build
npm start
```

## Licença

ISC · **PoktWeb**
