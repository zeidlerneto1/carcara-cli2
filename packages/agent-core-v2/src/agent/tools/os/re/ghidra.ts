import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const GhidraInputSchema = z.object({
  target: z.string().describe('The path to the binary to analyze.'),
  action: z
    .enum(['decompile', 'list_functions', 'xrefs_to', 'call_graph', 'rename'])
    .default('decompile')
    .describe(
      'Operation to run: decompile (C pseudo-code of a function), list_functions (JSON inventory), xrefs_to (JSON refs into an address), call_graph (JSON callers), or rename (symbol recovery).',
    ),
  function: z
    .string()
    .optional()
    .describe(
      'Function name or address (hex) to operate on. Required for decompile, xrefs_to, call_graph and rename; ignored for list_functions.',
    ),
  addr: z.string().optional().describe('Alias for `function` when passing a raw address.'),
  name: z.string().optional().describe('New function name for action=rename.'),
  depth: z
    .number()
    .int()
    .nonnegative()
    .default(3)
    .describe('Call-graph depth (action=call_graph).'),
  timeout: z
    .number()
    .int()
    .nonnegative()
    .default(30)
    .describe('Timeout in seconds for a single decompilation.'),
});

export type GhidraInput = z.infer<typeof GhidraInputSchema>;

export interface IGhidraTool extends AgentTool<GhidraInput> {
  readonly _serviceBrand: undefined;
}

export const IGhidraTool = createDecorator<IGhidraTool>('ghidraTool');
