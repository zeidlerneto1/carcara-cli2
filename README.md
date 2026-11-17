# Carcará CLI (fork do Kimi Code)

Este é um fork do [Kimi Code CLI](https://github.com/MoonshotAI/kimi-code), um agente de IA que roda no terminal — ele lê e edita código, executa comandos shell, busca arquivos, acessa páginas web e decide o próximo passo com base no feedback que recebe.

Este fork adiciona o **provider Carcará**, apontando o agente para a instância de inferência local do LNCC em `https://carcara.sinapad.lncc.br`, usando modelos como **DeepSeek-v4-Flash-0731** e **Qwen3.8-27B**.

> ⚠️ Este é um fork pessoal, sem CI/CD configurado. Todo build e release é feito localmente.

## Pré-requisitos

- **Node.js** `>= 24.15.0` (o arquivo `.nvmrc` aponta para `24.15.0`). Recomendado usar `nvm`, `fnm` ou `mise`.
- **pnpm** `10.33.0` (definido no `packageManager` do `package.json`).

> O `.npmrc` define `engine-strict=true`, então o `pnpm install` falha se a versão do Node não atender ao requisito.

## Baixar (instalação)

Clone este repositório e instale as dependências:

```sh
git clone https://github.com/zeidlerneto1/carcara-cli2.git
cd carcara-cli2
pnpm install
```

Compile o binário do CLI (gera `apps/kimi-code/dist/main.mjs`):

```sh
pnpm -C apps/kimi-code run build
```

## Login no Carcará

Antes de usar, faça login com o seu usuário no Carcará:

```sh
cd apps/kimi-code
node dist/main.mjs carcara-login --user SEU_USUARIO
```

Isso preenche automaticamente o cookie de sessão na configuração. Para sair:

```sh
node dist/main.mjs carcara-logout
```

## Configurar o harness (config.toml)

O harness (o agente) é configurado pelo arquivo `~/.kimi-code/config.toml`. Crie (ou edite) esse arquivo com o conteúdo abaixo, ajustando o `Cookie` com a sua sessão:

```toml
default_model = "carcara/deepseek"
default_thinking = false
default_yolo = false
skip_afk_prompt_injection = false
default_plan_mode = false
default_editor = ""
theme = "dark"
show_thinking_stream = true
hooks = []
merge_all_available_skills = true
extra_skill_dirs = []
telemetry = true

[providers.carcara]
base_url = "https://carcara.sinapad.lncc.br/service/v1"
type = "carcara"

[providers.carcara.custom_headers]
Accept = "*/*"
Accept-Language = "en-US,en;q=0.9,pt;q=0.8"
Referer = "https://carcara.sinapad.lncc.br/service/"
User-Agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
Origin = "https://carcara.sinapad.lncc.br"
Cookie = "PHPSESSID=<SUA_SESSAO>"

[models."carcara/deepseek"]
provider = "carcara"
model = "DeepSeek-v4-Flash-0731"
max_context_size = 200000
capabilities = [ "thinking" ]

[models."carcara/qwen"]
provider = "carcara"
model = "Qwen3.8-27B"
max_context_size = 200000
capabilities = [ "image_in", "video_in" ]

[thinking]
enabled = false

[secondary_model]
default_model = "carcara/qwen"
```

### Explicando os campos principais

- **`default_model`** — modelo usado por padrão. Aqui, `carcara/deepseek`.
- **`[providers.carcara]`** — define o endpoint e o tipo de provider. O `base_url` aponta para a API compatível com OpenAI do Carcará.
- **`[providers.carcara.custom_headers]`** — headers HTTP enviados nas requisições. O `Cookie` (`PHPSESSID`) autentica você na instância; o `carcara-login` preenche isso automaticamente.
- **`[models."carcara/deepseek"]` / `[models."carcara/qwen"]`** — registram os modelos disponíveis, com o nome real usado na API (`model`) e as capacidades suportadas (`thinking`, `image_in`, `video_in`).
- **`[thinking]`** — `enabled = false` desativa o modo de raciocínio (thinking) por padrão. Se você preferir que o agente raciocine antes de responder, mude para `true` (ou omita a seção).
- **`[secondary_model]`** — modelo auxiliar usado para tarefas menores, como gerar títulos de sessão.

> ⚠️ **Nunca compartilhe o seu `config.toml`** — ele contém o seu cookie de sessão, que é uma credencial.

## Rodar

Na pasta `apps/kimi-code`:

```sh
node dist/main.mjs
```

Isso abre a interface (TUI) do agente. Para trocar de modelo na hora:

```sh
node dist/main.mjs -m carcara/qwen
```

### Solução de problemas rápida

| Problema | Solução |
| --- | --- |
| `pnpm install` falha | Confira a versão do Node (`node -v`) e use `nvm use 24.15.0` ou equivalente. |
| Erro de autenticação / sessão expirada | Rode `node dist/main.mjs carcara-login --user SEU_USUARIO` de novo. |
| O agente ainda mostra "thinking" | Garanta que `[thinking] enabled = false` está no `config.toml` e reinicie o processo. |
| Modelo não encontrado | Confira o nome exato do modelo no servidor e o campo `model` no `config.toml`. |

## Documentação

- `CARCARA-GUIDE.md` — guia detalhado do provider Carcará e do login.
- `docs/` — documentação completa do Kimi Code CLI (a documentação oficial do upstream).

## Licença

Este projeto é distribuído sob a licença [MIT](LICENSE), conforme o repositório original.
