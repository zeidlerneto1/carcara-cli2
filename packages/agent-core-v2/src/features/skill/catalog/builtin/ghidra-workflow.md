---
name: ghidra-workflow
description: Fluxo de trabalho com sessão Ghidra persistente — abrir o binário uma vez, inventariar funções via list_functions, decompilar apenas os alvos sob demanda e expandir com xrefs_to/call_graph sem reimportar nem reanalisar. Use sempre que for decompilar firmware ou ELF/PE com GhidraDecompile.
---

# Workflow Ghidra Persistente

A tool `GhidraDecompile` mantém uma **sessão Ghidra viva por binário** (cache por
SHA-256 do conteúdo, não do nome de arquivo). O import + análise acontecem **uma única
vez**; as chamadas seguintes reutilizam o projeto aberto. Isso elimina o gargalo de
reimport/reanálise por chamada.

## Funil estrutural (não decompile tudo)

1. **open** — passe `target` no primeiro `GhidraDecompile` para abrir o projeto.
2. **list_functions** (`action="list_functions"`) — obtenha o inventário JSON
   (`name`/`addr`/`size`/`signature`). Use isto para escolher alvos, não o corpo do
   código.
3. **decompile sob demanda** (`action="decompile"`, `function="<nome ou endereço>"`) —
   só para as funções relevantes à superfície de ataque.
4. **expandir sem decompilar tudo** — `xrefs_to` (quem referencia um endereço) e
   `call_graph` (quem chama, até `depth`) para rastrear o fluxo de dados.
5. **rename** (`action="rename"`, `function` + `name`) — recupere símbolos; a sessão
   viva reflete o novo nome nas próximas decompilações.

## Ordem recomendada

- Comece sempre por `BinIdent` (formato/arch) e `BinStrings` (strings) antes de abrir o
  Ghidra — isso guia a escolha de alvos e evita decompilar o binário inteiro.
- Para firmware MIPS o32, lembre: delay slots, `$gp`/`$t9` em chamadas indiretas
  (`jalr`), syscall em `$v0`. Para x86-64 System V, args em `rdi/rsi/rdx/rcx/r8/r9`.
  Consulte `RefRE` (tópicos `mitigations`, `techniques`) para ancorar conclusões.

## Segurança e limites

- `timeout` default de 30s por decompilação; aumente explicitamente se uma função for
  grande.
- Se o Ghidra não estiver instalado (falta o `analyzeHeadless`, `$GHIDRA_HOME` ou o
  comando `ghidra` no PATH), a tool **falha explicitamente** (não pula em silêncio) com
  um hint de instalação.
- Registre cada etapa via `PersistSession` em `rev/<target>.md`; nunca carregue o
  relatório inteiro no contexto — use `Grep` como camada RAG léxica.
