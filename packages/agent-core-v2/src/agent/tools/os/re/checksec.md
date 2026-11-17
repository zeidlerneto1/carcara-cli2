Check the exploit mitigations of an ELF binary (NX, PIE, RELRO, canary, fortify) by parsing the ELF headers and sections directly — no external `checksec` binary needed.

Provide the path to the ELF target. Architecture is read from the ELF header; NX/PIE/RELRO are derived from program headers and sections, canary from a `__stack_chk_fail` reference, and fortify from a `__fortify_fail` reference. If the target cannot be read or is not an ELF, the tool fails with a clear error.
