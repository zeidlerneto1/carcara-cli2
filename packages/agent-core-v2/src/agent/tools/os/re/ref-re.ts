import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const RefReInputSchema = z.object({
  topic: z.string().describe("The reference topic to read (e.g. 'mitigations')."),
});

export type RefReInput = z.infer<typeof RefReInputSchema>;

export interface IRefReTool extends AgentTool<RefReInput> {
  readonly _serviceBrand: undefined;
}

export const IRefReTool = createDecorator<IRefReTool>('refReTool');
