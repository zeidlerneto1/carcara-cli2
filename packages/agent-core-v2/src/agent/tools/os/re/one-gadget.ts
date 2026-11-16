import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const OneGadgetInputSchema = z.object({
  libc: z.string().describe('The path to the libc (or other ELF) to scan for one-gadgets.'),
});

export type OneGadgetInput = z.infer<typeof OneGadgetInputSchema>;

export interface IOneGadgetTool extends AgentTool<OneGadgetInput> {
  readonly _serviceBrand: undefined;
}

export const IOneGadgetTool = createDecorator<IOneGadgetTool>('oneGadgetTool');
