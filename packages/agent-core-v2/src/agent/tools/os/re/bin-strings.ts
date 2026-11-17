import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const BinStringsInputSchema = z.object({
  target: z.string().describe('The path to the binary to scan for strings.'),
  min_length: z
    .number()
    .int()
    .nonnegative()
    .default(4)
    .describe('The minimum string length to report.'),
  encoding: z
    .enum(['s', 'b', 'S', 'l'])
    .default('s')
    .describe(
      'The character encoding: s=7-bit ASCII, b=8-bit bytes, S=16-bit little-endian, l=16-bit big-endian.',
    ),
});

export type BinStringsInput = z.infer<typeof BinStringsInputSchema>;

export interface IBinStringsTool extends AgentTool<BinStringsInput> {
  readonly _serviceBrand: undefined;
}

export const IBinStringsTool = createDecorator<IBinStringsTool>('binStringsTool');
