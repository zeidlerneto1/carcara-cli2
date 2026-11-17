import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const BinIdentInputSchema = z.object({
  target: z.string().describe('The path to the binary to identify.'),
});

export type BinIdentInput = z.infer<typeof BinIdentInputSchema>;

export interface IBinIdentTool extends AgentTool<BinIdentInput> {
  readonly _serviceBrand: undefined;
}

export const IBinIdentTool = createDecorator<IBinIdentTool>('binIdentTool');
