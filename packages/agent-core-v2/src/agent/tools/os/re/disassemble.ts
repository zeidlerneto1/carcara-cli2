import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const DisassembleInputSchema = z.object({
  target: z.string().describe('The path to the binary to disassemble.'),
  arch: z
    .enum(['mips', 'arm', 'x86', 'x86_64'])
    .optional()
    .describe('Target architecture. Defaults to auto-detect.'),
  endian: z
    .enum(['big', 'little'])
    .optional()
    .describe('Byte order. Defaults to auto-detect.'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('File offset (in bytes) to disassemble from.'),
  va: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Virtual address to disassemble from; translated to a file offset via .text.'),
  size: z
    .number()
    .int()
    .nonnegative()
    .default(0x40)
    .describe('Number of bytes to disassemble.'),
  count: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe('Max instructions to emit; 0 means all in size.'),
});

export type DisassembleInput = z.infer<typeof DisassembleInputSchema>;

export interface IDisassembleTool extends AgentTool<DisassembleInput> {
  readonly _serviceBrand: undefined;
}

export const IDisassembleTool = createDecorator<IDisassembleTool>('disassembleTool');
