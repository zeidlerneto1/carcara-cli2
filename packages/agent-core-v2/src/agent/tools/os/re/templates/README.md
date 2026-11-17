# Exploit templates

Renderable pwntools skeletons consumed by the `ExploitTemplate` tool. Each file is a
Python `string.Template` (`.py.tpl`) with `$PLACEHOLDER` markers substituted at render
time. Placeholders are documented in each template's header.

## Map: classe → arquivo → quando usar

| Classe de bug | Template | Quando usar |
|---|---|---|
| Stack buffer overflow (ret) | `stack/bof_x86_64` | BOF clássico que sobrescreve o return address; ret para um endereço fixo (non-PIE). |
| ret2libc | `stack/ret2libc_x86_64` | NX habilitado; precisa chamar `system("/bin/sh")` via ROP a partir de libc. |
| Format string (write) | `fmt/fmt_write_x86_64` | `printf` controlado; escrever um valor em um endereço arbitrário via `%n`. |
| Heap tcache dup | `heap/tcache_dup` | Duplicar uma chunk do tcache para obter um write primitivo (glibc ≥ 2.26). |
| FSOP | `heap/fsop` | Corromper `_IO_FILE`/`_IO_list_all` para ganhar execução (glibc). |
| SROP | `srop_x86_64` | Syscall `rt_sigreturn` para construir frames e pivotar para `execve` sem muitos gadgets. |

## Fonte

Todos os templates citam a [Bíblia do Pentest BR](https://0xmorte.gitbook.io/bibliadopentestbr/)
na seção de memory corruption. Confira o cabeçalho de cada arquivo para a URL e a data de
sincronização exata.
