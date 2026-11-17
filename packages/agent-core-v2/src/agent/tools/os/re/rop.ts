import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const RopInputSchema = z.object({
  target: z.string().describe('The path to the binary to search for ROP gadgets.'),
  pattern: z.string().default('').describe("Optional gadget pattern/filter (e.g. 'pop rdi')."),
  limit: z
    .number()
    .int()
    .positive()
    .default(50)
    .describe('Max gadget lines to return. Truncates to avoid blowing context.'),
});

export type RopInput = z.infer<typeof RopInputSchema>;

export interface IRopTool extends AgentTool<RopInput> {
  readonly _serviceBrand: undefined;
}

export const IRopTool = createDecorator<IRopTool>('ropTool');
