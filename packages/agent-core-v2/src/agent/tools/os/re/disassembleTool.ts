import { readFile } from 'node:fs/promises';

import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ExecutableToolResult, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { acquireOrWhenReady, IAgentEnvironmentService, pinnedGeneration } from '#/agent/environmentBinding/agentEnvironment';
import type { IHostProcessService } from '#/os/interface/hostProcess';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import {
  detectFormat,
  detectElf,
  detectPe,
  objdumpArchFlag,
  resolveTextSection,
  runCommand,
  type ReArch,
} from './shared';
import DISASSEMBLE_DESCRIPTION from './disassemble.md?raw';
import { type DisassembleInput, DisassembleInputSchema, IDisassembleTool } from './disassemble';

export class DisassembleTool implements IDisassembleTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'Disassemble' as const;
  readonly description = DISASSEMBLE_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(DisassembleInputSchema);
  constructor(@IAgentEnvironmentService private readonly environment: IAgentEnvironmentService) {}

  async resolveExecution(args: DisassembleInput): Promise<ToolExecution> {
    const resolutionLease = await acquireOrWhenReady(this.environment, ['process']);
    try {
      const inspected = resolutionLease.environment;
      const expectedGeneration = pinnedGeneration(inspected);
      return {
        accesses: ToolAccesses.none(),
        description: `Disassembling ${args.target}`,
        approvalRule: literalRulePattern(this.name, args.target),
        execute: async () => {
          const lease = await acquireOrWhenReady(this.environment, ['process']);
          try {
            if (expectedGeneration !== undefined && lease.environment.identity.generation !== expectedGeneration) {
              return { isError: true, output: 'Environment changed before execution. Retry the tool call.' };
            }
            return await this.execution(lease.environment.process!, args);
          } finally {
            lease.dispose();
          }
        },
      };
    } finally {
      resolutionLease.dispose();
    }
  }

  private async execution(
    processService: IHostProcessService,
    args: DisassembleInput,
  ): Promise<ExecutableToolResult> {
    const builder = new ToolOutputAccumulator();
    let header: Buffer;
    let data: Buffer;
    try {
      header = (await readFile(args.target)).subarray(0, 64);
      data = await readFile(args.target);
    } catch {
      return builder.error(`Could not read \`${args.target}\`.`);
    }

    const fmt = detectFormat(header);
    if (fmt === null) {
      return builder.error(`\`${args.target}\` is not an ELF or PE binary.`);
    }

    let arch: ReArch | null;
    let endian: 'big' | 'little';
    if (fmt === 'elf') {
      const detected = detectElf(header);
      arch = detected.arch;
      endian = detected.endian ?? 'little';
    } else {
      const detected = detectPe(data, header);
      arch = detected.arch;
      endian = detected.endian;
    }
    if (args.arch !== undefined) arch = args.arch;
    if (args.endian !== undefined) endian = args.endian;
    if (arch === null) {
      return builder.error(
        `Could not auto-detect the architecture of \`${args.target}\`; pass \`arch\` explicitly.`,
      );
    }

    const text = await resolveTextSection(processService, args.target, fmt);
    if (text === null) {
      return builder.error(
        `Could not resolve the .text section of \`${args.target}\` (via ${fmt === 'elf' ? 'readelf' : 'objdump'}).`,
      );
    }

    let offset = args.offset;
    if (offset === undefined && args.va !== undefined) {
      if (!(text.addr <= args.va && args.va < text.addr + text.size)) {
        return builder.error(
          `va ${hex(args.va)} is not inside .text (${hex(text.addr)}..${hex(text.addr + text.size)}).`,
        );
      }
      offset = text.off + (args.va - text.addr);
    } else if (offset === undefined) {
      offset = text.off;
    }

    if (offset < 0 || offset >= data.length) {
      return builder.error(
        `Offset ${String(offset)} is out of range (file is ${String(data.length)} bytes).`,
      );
    }

    const startVa = offset - text.off + text.addr;
    const stopVa = startVa + args.size;
    const result = await runCommand(processService, 'objdump', [
      '-d',
      '-m',
      objdumpArchFlag(arch),
      ...(arch === 'mips' ? ['-M', `no-aliases,${endian === 'big' ? 'big-endian' : 'little-endian'}`] : []),
      `--start-address=${hex(startVa)}`,
      `--stop-address=${hex(stopVa)}`,
      args.target,
    ]);
    if (result.exitCode !== 0) {
      return builder.error(
        `objdump failed on \`${args.target}\` (exit ${String(result.exitCode)}).`,
      );
    }

    let emitted = 0;
    let written = 0;
    for (const line of result.output.split('\n')) {
      if (written >= args.size) break;
      if (args.count > 0 && emitted >= args.count) break;
      const parsed = parseObjdumpLine(line);
      if (parsed === null) continue;
      builder.write(`0x${hex(parsed.addr)}  ${parsed.bytes}  ${parsed.text}\n`);
      emitted += 1;
      written += parsed.bytes.length > 0 ? parsed.bytes.length / 2 : 0;
    }

    return builder.ok(`Disassembled ${hex(offset)} (${String(args.size)} bytes) of ${args.target}.`);
  }
}

function parseObjdumpLine(line: string): { addr: number; bytes: string; text: string } | null {
  const m = /^\s*([0-9a-f]+):\s+(.*)$/.exec(line);
  if (m === null) return null;
  const addr = parseInt(m[1]!, 16);
  const rest = m[2]!;
  const tab = rest.indexOf('\t');
  if (tab < 0) return null;
  const bytes = rest.slice(0, tab).trim();
  const text = rest.slice(tab + 1).trim();
  return { addr, bytes, text };
}

function hex(value: number): string {
  return value.toString(16);
}

registerAgentToolService(IDisassembleTool, DisassembleTool, {
  name: 'Disassemble',
  domain: 'os/backends',
  requiredEnvironmentCapabilities: ['process'],
});
