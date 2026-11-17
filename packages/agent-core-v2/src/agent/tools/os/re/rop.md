Find ROP gadgets in a binary. Uses the first available external engine: the `ROPgadget` CLI, or the `ropper` CLI. Truncates output to `limit` lines to avoid blowing the context window.

Provide the path to the binary, optionally a `pattern` to filter gadgets and a `limit`. Requires an external `ROPgadget` or `ropper` binary; the tool reports a clear error when none is available.
