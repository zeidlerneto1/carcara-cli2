# Guia: Logar no Carcará e Rodar o Kimi Code

Este guia explica como autenticar no **Carcará** (plataforma de LLM do LNCC/Sinapad)
usando o Kimi Code e depois rodar a interface interativa.

---

## 1. Pré-requisitos

- Repositório clonado e dependências instaladas (Node.js + pnpm).
- Build do app feito (gera `apps/kimi-code/dist/main.mjs`). Se ainda não fez:

```sh
cd /home/peter/others/kimi-code
pnpm install
pnpm -C apps/kimi-code run build
```

- Um **usuário** e **senha** válidos do Carcará (Sinapad/LNCC).

---

## 2. Rodar o projeto a partir do build

Entre na pasta do app e rode o binário com Node:

```sh
cd /home/peter/others/kimi-code/apps/kimi-code
node dist/main.mjs
```

Isso abre a **interface interativa (TUI)** do Kimi Code.

### (Opcional) Criar um atalho `kimi`

Para não digitar o caminho inteiro toda vez, adicione ao seu `~/.bashrc`:

```sh
alias kimi='node /home/peter/others/kimi-code/apps/kimi-code/dist/main.mjs'
```

Depois recarregue o shell:

```sh
source ~/.bashrc
```

A partir daí basta:

```sh
kimi
```

---

## 3. Logar no Carcará

O Kimi Code tem um comando dedicado para autenticar no Carcará.

### 3.1. Login interativo (recomendado)

O comando pede a senha no terminal (não aparece na tela):

```sh
cd /home/peter/others/kimi-code/apps/kimi-code
node dist/main.mjs carcara-login --user SEU_USUARIO
```

> Se você criou o alias `kimi`, basta: `kimi carcara-login --user SEU_USUARIO`

### 3.2. Login com senha na linha de comando

```sh
node dist/main.mjs carcara-login --user SEU_USUARIO --password SUA_SENHA
```

### 3.3. Opções disponíveis

| Opção | Descrição | Padrão |
|-------|-----------|--------|
| `--user <name>` | Usuário Carcará (ou env `CARCARA_USER`) | — |
| `--password <pass>` | Senha (se omitida, pede interativamente) | — |
| `--domain <domain>` | Domínio de login | `LNCC` |
| `--base-url <url>` | URL base do serviço | `https://carcara.sinapad.lncc.br/service/v1` |

---

## 4. O que o login faz

Ao executar `carcara-login` com sucesso:

1. Envia `POST` para `/apps/login/action/loginAction.php` no Sinapad.
2. Recebe e guarda o cookie de sessão `PHPSESSID`.
3. Salva a sessão em `~/.kimi-code/credentials/carcara-<host>.json`.
4. Grava no config `~/.kimi-code/config.toml`:
   - Provider `carcara` (com o `PHPSESSID` no cabeçalho de autenticação).
   - Modelos:
     - `carcara/deepseek` → `DeepSeek-v4-Flash-0731` (131072 de contexto, com thinking)
     - `carcara/qwen` → `Qwen3.8-27B` (32768 de contexto)
   - Se ainda não houver modelo padrão, define `carcara/deepseek`.

---

## 5. Rodar a interface usando o Carcará

Depois de logado, basta abrir a interface normalmente:

```sh
cd /home/peter/others/kimi-code/apps/kimi-code
node dist/main.mjs
```

O Kimi Code já usará o Carcará como provider.

### Trocar o modelo Carcará

Na interface, use `/model` para escolher entre os modelos disponíveis, por exemplo:

```
/model carcara/qwen
```

Ou, fora da interface, passe o modelo direto na linha de comando:

```sh
node dist/main.mjs -m carcara/qwen
```

---

## 6. Encerrar a sessão Carcará

```sh
cd /home/peter/others/kimi-code/apps/kimi-code
node dist/main.mjs carcara-logout
```

> **Nota:** o `carcara-logout` apaga o arquivo de sessão
> (`~/.kimi-code/credentials/carcara-<host>.json`), mas **não** remove o provider e
> o `PHPSESSID` que ficaram gravados no `~/.kimi-code/config.toml`. Para limpar o
> config manualmente, edite o arquivo e remova as entradas `providers.carcara` e
> `models["carcara/*"]` (e o `defaultModel`, se apontar para o Carcará).

---

## 7. Solução de problemas

| Problema | O que fazer |
|----------|-------------|
| `Missing Carcará username` | Passe `--user <name>` ou exporte `CARCARA_USER` |
| `Carcará password is required` | Digite a senha no prompt (ou passe `--password`) |
| `Carcará login request failed` | Verifique a conexão de rede com o Sinapad |
| `Carcará login rejected` | Confira usuário/senha/domínio |
| `Carcará login did not return a PHPSESSID` | Login mal-sucedido; confira credenciais |
| `403 Forbidden` ao usar | A sessão expirou; rode `carcara-login` de novo |

---

## Referência rápida

```sh
# Build (se necessário)
cd /home/peter/others/kimi-code && pnpm -C apps/kimi-code run build

# Login no Carcará
cd /home/peter/others/kimi-code/apps/kimi-code
node dist/main.mjs carcara-login --user SEU_USUARIO

# Rodar a interface
node dist/main.mjs

# Trocar de modelo na CLI
node dist/main.mjs -m carcara/qwen

# Sair
node dist/main.mjs carcara-logout
```
