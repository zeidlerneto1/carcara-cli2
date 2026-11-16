import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const EmulateInputSchema = z.object({
  target: z.string().describe('The path to the ELF binary to emulate.'),
  arch: z
    .enum(['mips', 'arm', 'x86', 'x86_64'])
    .optional()
    .describe('Target architecture. Defaults to auto-detect from the ELF header.'),
  endian: z
    .enum(['big', 'little'])
    .optional()
    .describe('Byte order. Defaults to auto-detect; picks qemu-mips (big) vs qemu-mipsel (little).'),
  args: z
    .array(z.string())
    .default([])
    .describe('Command-line arguments to pass to the emulated target.'),
  stdin: z
    .string()
    .optional()
    .describe('Input to write to the emulated target\'s stdin.'),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe('Extra environment variables to set for the emulated target.'),
  sysroot: z
    .string()
    .optional()
    .describe('ELF interpreter prefix (qemu -L) for firmware that depends on the target\'s libs.'),
  timeout_ms: z
    .number()
    .int()
    .positive()
    .default(30000)
    .describe('Execution timeout in milliseconds.'),
});

export type EmulateInput = z.infer<typeof EmulateInputSchema>;

export interface IEmulateTool extends AgentTool<EmulateInput> {
  readonly _serviceBrand: undefined;
}

export const IEmulateTool = createDecorator<IEmulateTool>('emulateTool');
