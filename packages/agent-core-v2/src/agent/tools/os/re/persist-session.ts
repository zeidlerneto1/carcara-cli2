import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const PersistSessionInputSchema = z.object({
  target: z.string().describe('The binary or library name (may keep .so/.a/.dll).'),
  notes: z.string().describe('The complete state markdown to persist.'),
  merge: z
    .boolean()
    .default(true)
    .describe('Merge with an existing file, preserving its tools section.'),
});

export type PersistSessionInput = z.infer<typeof PersistSessionInputSchema>;

export interface IPersistSessionTool extends AgentTool<PersistSessionInput> {
  readonly _serviceBrand: undefined;
}

export const IPersistSessionTool = createDecorator<IPersistSessionTool>('persistSessionTool');
