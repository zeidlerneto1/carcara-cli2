import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const ChecksecInputSchema = z.object({
  target: z.string().describe('The path to the ELF binary to check mitigations on.'),
});

export type ChecksecInput = z.infer<typeof ChecksecInputSchema>;

export interface IChecksecTool extends AgentTool<ChecksecInput> {
  readonly _serviceBrand: undefined;
}

export const IChecksecTool = createDecorator<IChecksecTool>('checksecTool');
