# Pokt CLI

CLI de **Vibe Coding** com IA: OpenRouter, Ollama (local e cloud), Gemini e provedor Pokt (controller).

## Requisitos

- **Node.js** >= 18.0.0

## Instalação

```bash
# Instalação global
npm install -g pokt-cli

# Ou use sem instalar
npx pokt-cli
```

## Uso

Sem argumentos, o Pokt abre um menu interativo:

```bash
pokt
```

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

### Config (`config`)

- `pokt config show` — Mostra a configuração atual (tokens mascarados).
- `pokt config set-openrouter -v <token>` — Token OpenRouter.
- `pokt config set-ollama -v <url>` — URL base do Ollama local.
- `pokt config set-ollama-cloud -v <key>` — API key Ollama Cloud.
- `pokt config set-gemini -v <key>` — API key Google Gemini.
- `pokt config set-pokt-token -v <token>` — Token do controller Pokt.
- `pokt config clear-openrouter` — Remove o token OpenRouter.

### Modelos (`models`)

- `pokt models list` — Lista modelos registrados e o ativo.
- `pokt models fetch-openrouter` — Busca modelos disponíveis no OpenRouter.
- `pokt models fetch-ollama` — Busca modelos do Ollama local.
- `pokt models fetch-ollama-cloud` — Busca modelos do Ollama Cloud.
- `pokt models add-openrouter`, `add-ollama`, `add-ollama-cloud` — Adiciona modelo (use `-i <id>`).
- `pokt models use -i <id> -p <provider>` — Define o modelo ativo.

### Provedores (`provider`)

Provedores suportados: `controller` (Pokt), `openrouter`, `gemini`, `ollama`, `ollama-cloud`.

```bash
pokt provider use openrouter
pokt provider use ollama
```

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
