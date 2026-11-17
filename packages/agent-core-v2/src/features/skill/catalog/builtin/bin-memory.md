---
name: bin-memory
description: Arquitetura de vulnerabilidades de memória — reconhecer e classificar a classe de um bug (stack buffer overflow, heap/glibc, use-after-free, format string, integer overflow, TOCTOU) e conectá-la à primitiva de memória correspondente. Use quando a análise estática/simbólica apontar um padrão vulnerável.
---
> Fonte: [Bíblia do Pentest BR](https://0xmorte.gitbook.io/bibliadopentestbr/) — seção *Arquitetura de vulnerabilidades de memória*
> Última sincronização: 2026-11-05


# Arquitetura de Vulnerabilidades de Memória

Codifica a classificação de bugs de memória e o mapeamento para primitivas, ligando o que a
análise estática/simbólica (skill `bin-recon`) encontrou a **que tipo de corrupção de memória
é** e **que primitiva ela dá**. Não reinvente: `RefRE memory` é a referência concisa de
consulta; esta skill organiza o raciocínio de classificação.

Trabalhe em ordem: primeiro situe o espaço de memória, depois classifique o padrão, depois
determine a primitiva.

## 1. Espaço de memória do processo

Localize onde o padrão vive no layout do processo — isto define o que é alcançável e quais
mitigações se aplicam (veja `RefRE mitigations`):

- **Kernel space** — inacessível por user-mode; fora do escopo direto.
- **Stack** (cresce para baixo): variáveis locais, endereços de retorno, quadros de função,
  **canary** (barreira entre buffer e ret). Overflow de stack corrompe ret → controle de fluxo.
- **Heap** (cresce para cima): alocações dinâmicas (`malloc`), objetos C++ (vtable).
- **BSS / DATA**: dados não inicializados / inicializados; globals e ponteiros.
- **TEXT** (read-only, protegido por DEP/NX): código executável, `.plt`/`.got` (RELRO) no ELF; no **PE** o equivalente é `.text` + imports/`.rdata` (sem GOT — o modelo de ataque difere, veja `RefRE techniques`).

## 2. Classificação do bug (CWE → primitiva)

Para cada padrão vulnerável identificado, classifique a classe e a primitiva que ele oferece.
Use `RefRE memory` para os detalhes técnicos de cada uma.

### Stack Buffer Overflow (CWE-121/122)
- Layout: `[buffer] [canary] [saved rbp] [ret]` (x86-64). Overflow passa o buffer, toca o
  canary (detectado) e alcança o `ret`.
- Primitiva: **controle do retorno** → ROP/ret2libc (veja `RefRE techniques`).
- Bloqueado por: canary (leak ou não tocar) + NX (ROP).

### Heap e o allocator glibc
- Estrutura de chunk: `size|flags`, `fd` (prev), `bk` (next), dados. Flags: `PREV_INUSE`,
  `IS_MMAPPED`, `NON_MAIN_ARENA`.
- Bins: **tcache** (LIFO, sem size check — caminho mais fácil), **fastbins** (LIFO),
  **unsorted** (recém-liberados, coalescing), **small/largebins**, **top chunk**.
- Primitivas comuns (consulte `RefRE memory`): tcache poisoning, fastbin dup, unsafe unlink,
  House of Force, House of Spirit, unsorted bin attack, **FSOP** (corromper `_IO_FILE`).
- Primitiva geral: **arbitrary alloc / arbitrary write** → write-what-where.

### Use-After-Free (CWE-416)
- Um ponteiro é usado após o objeto ser liberado; realocar um objeto do mesmo tamanho (ou um
  chunk falso) no slot e o ponteiro pendente lê/escreve memória controlada.
- Primitiva: **read/write arbitrário**; combina com fastbin/tcache dup.

### Format String (CWE-134)
- `printf(input)` sem formato: `%n` grava o nº de bytes impressos no endereço puxado da
  stack/registrador; `%N$p`/`%N$s` vazam stack/libc; `%N$n` escreve.
- Primitiva: **leitura (infoleak) + escrita** — o infoleak alimenta etapas seguintes.

### Integer Overflow / Truncation (CWE-190)
- Aritmética de tamanho/índice que wrappeia (`bufsize - 1` com `bufsize == 0`), gerando
  alocação menor que a cópia ou índice OOB.
- Primitiva: geralmente **causa raiz** que habilita um heap/stack overflow posterior.

### Race Conditions / TOCTOU (CWE-367)
- Validação e depois uso assumem o mesmo estado; uma corrida troca o objeto no meio.
- Primitiva: **arbitrary file read/write** sem tocar memória; comum em firmware com file
  handling privilegiado.

## 3. Determinar a primitiva e o bypass

- Para cada classe, responda: *que primitiva isso dá?* (controle de fluxo, arbitrary
  write, infoleak, etc.).
- Cruze com as mitigações ativas (`RefRE mitigations`): NX → ROP; ASLR → precisa de infoleak;
  canary → leak ou não tocar; Full RELRO → sem GOT overwrite (ret2dlresolve/FSOP/hook).
- Seja honesto sobre o que é provado vs. hipotetizado; se uma mitigaçao bloqueia a primitiva,
  diga (veja `RefRE bypass`).

## Checklist rápido

- [ ] Padrão vulnerável localizado no espaço de memória (stack/heap/bss/data).
- [ ] Classe CWE identificada (BOF, UAF, format, int overflow, TOCTOU).
- [ ] Primitiva de memória determinada.
- [ ] Mitigações ativas cruzadas com a primitiva (NX/ASLR/canary/RELRO/CFG).
- [ ] Bypass viável ou declaração honesta de bloqueio.
