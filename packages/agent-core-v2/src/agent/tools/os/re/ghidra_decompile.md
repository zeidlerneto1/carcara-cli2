Analyze a binary with Ghidra through a **persistent** headless project, cached per binary.

Provide the path to the target binary. The project is opened and analyzed once per binary (keyed by SHA-256) and reused across calls, so the second and later decompilations of the same binary are fast (no re-import or re-analysis). Operations:

- `decompile` (default): C pseudo-code for a function (by name or hex address).
- `list_functions`: JSON inventory with `name`/`addr`/`size`/`signature`.
- `xrefs_to`: JSON of references into an address (who calls/reads it).
- `call_graph`: JSON of callers up to `depth` hops.
- `rename`: symbol recovery — takes effect on subsequent decompilations.

Requires a local Ghidra installation (the `analyzeHeadless` binary). It is located via `$GHIDRA_HOME/support/`, common snap install locations, or the `ghidra` command in PATH. If Ghidra is unavailable, the tool fails explicitly with an install hint instead of silently skipping.
