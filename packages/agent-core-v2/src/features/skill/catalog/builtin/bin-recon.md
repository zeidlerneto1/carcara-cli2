---
name: bin-recon
description: Reconhecimento de binários — identificar o alvo, mapear a superfície de ataque (entradas controladas, parsers, rede, IPC, file parsing, deserialização) e aprofundar com análise estática e simbólica, antes de qualquer fuzzing ou desenvolvimento de exploit. Use no início de toda análise de um binário.
---
> Fonte: [Bíblia do Pentest BR](https://0xmorte.gitbook.io/bibliadopentestbr/) — seção *Reconhecimento de binários*
> Última sincronização: 2026-11-05


# Binário Reconnaissance

Codifica as fases de **seleção de alvo** e **mapeamento de superfície** do pipeline de
descoberta de vulnerabilidades. O objetivo é responder duas perguntas antes de gastar tempo
em fuzzing/descoberta: *que binário é este?* e *por onde um atacante pode controlá-lo?*

Trabalhe em ordem, usando a ferramenta correspondente de cada passo. Não pule etapas; cada
uma alimenta a seguinte.

## 1. Seleção de alvo

- Escolha o componente de **maior valor/impacto** do conjunto: daemon de rede, parser de
  formato, utilitário SUID, biblioteca compartilhada carregada por serviço exposto.
- Correlacione com o contexto: CVEs correlatas, changelogs, declarações de bug bounty,
  código-fonte público quando houver (n-day → 0-day).
- Registre **autorização/escopo** antes de prosseguir (veja `RefRE legal`).

## 2. Identificação do binário — `BinIdent`

- Arquitetura, endianness, stripped ou não, statically/dynamically linked, entry point,
  seções. **Registre o hash** do arquivo (serve de identidade para o `PersistSession`).
- Se um `rev/<target>.md` de sessão anterior existir, retome dele antes de refazer o trabalho.

## 3. Mitigações — `RefRE mitigations` + `Checksec`

- canary, NX/DEP, PIE/ASLR, RELRO, CFG/CET, fortify.
- Isto molda toda a estratégia posterior (ex.: NX ativo → ROP; Full RELRO → sem overwrite de GOT).
- **Formato importa**: `Checksec` lê ELF diretamente. Para seções/headers, use `readelf`/`objdump -h` em **ELF** e `objdump -f`/`-h` ou `llvm-readobj` em **PE** (`readelf` não lê PE). Anote o SO alvo e a plataforma (Linux x86-64 / Windows PE / ARM / firmware MIPS), pois mudam as primitivas.

## 4. Mapeamento da superfície — `BinStrings` + disassembly

Inventarie **todas as entradas controláveis** do binário:

- **argv / stdin / variáveis de ambiente**.
- **Sockets / rede**: bind/connect, `recv`/`send`, protocolos (HTTP, UPnP SOAP, DNS, custom).
- **IPC**: pipes, memória compartilhada, signals, mensagens.
- **File parsing**: caminhos abertos, formatos (config, XML, PNG, dados de firmware).
- **Deserialização / parse de estruturas**: campos de tamanho e conteúdo controlados.

Use `BinStrings` para localizar format strings, nomes de comando, banners, caminhos e
palavras-chave de rede. Em seguida, disassemble/decompile (`Disassemble`,
`GhidraDecompile`) para achar os **sinks**: `strcpy`/`strcat`/`memcpy`/`printf`/`snprintf`/
`system`/`socket`/`recv`/`malloc`.

## 5. Análise estática e simbólica

Depois de mapear a superfície, aprofunde nos caminhos candidatos usando análise **estática**
(cobertura total, rápido, com falsos positivos) e **simbólica** (descobre bugs por caminhos
via SMT, sujeita a path explosion). Combine as duas: a estática aponta funções/alvos; a
simbólica prova a alcançabilidade de um alvo ou gera um input que chega até ele.

- **Estática** — `Disassemble` + `GhidraDecompile` + `RefRE`: reconstrua a lógica das funções
  alcançáveis, corrija a semântica dos sinks e valide o fluxo de dados de cada entrada até o
  sink. Aproveite as seções de referência (`techniques`, `memory`) para reconhecer padrões
  vulneráveis (overflow, UAF, format string, integer overflow, TOCTOU).
- **Simbólica / concolic** — use `Bash` para rodar um harness (ex.: `angr`, `Triton`, `z3`)
  quando for preciso resolver constraints ou provar que um input alcança uma função/sink
  crítico (`system@plt`, uma flag, um `memcpy` com tamanho controlado). Prefira scripts curtos
  e descartáveis (spike) que explorem apenas o caminho de interesse; a análise simbólica
  sofre de **path explosion**, então restrinja o escopo ao alvo.
- **Correlacione** os achados estáticos/simbólicos com a superfície mapeada na etapa 4 e com
  CVEs/diffs de patch conhecidos (n-day → 0-day).

## 6. Correlação e entrega

- Trace cada entrada controlada até o sink que ela alcança (reachability).
- Entregue uma **lista priorizada** por (entrada, função/sink, VA) e por alcance/impacto:
  parsers de formato complexo e caminhos de rede vêm primeiro — são os alvos de fuzzing.
- Isto alimenta as fases seguintes que o agente reverser já cobre (discovery, triage,
  exploit). Consulte `RefRE` (`fuzzing`, `memory`, `techniques`) conforme necessário.

## Checklist rápido

- [ ] Autorização/escopo registrados.
- [ ] `BinIdent`: arch, endianness, stripped, link mode, hash.
- [ ] `RefRE mitigations`: canary, NX, PIE, RELRO, CFG/CET.
- [ ] `BinStrings`: strings relevantes coletadas.
- [ ] Entradas controladas inventariadas (rede, IPC, file, argv, stdin, deserialização).
- [ ] Sinks localizados e mapeados.
- [ ] Análise estática (disassembly/decompilação) dos caminhos candidatos.
- [ ] Análise simbólica (angr/Triton) usada quando preciso provar alcançabilidade ou gerar input.
- [ ] Lista priorizada por reachability/impacto produzida.
