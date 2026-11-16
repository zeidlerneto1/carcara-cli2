import { readFile } from 'node:fs/promises';

import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ExecutableToolResult, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { IAgentRuntimeService, inspectAgentRuntime } from '#/agent/runtimeBinding/agentRuntime';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import { detectFormat } from './shared';
import CHECKSEC_DESCRIPTION from './checksec.md?raw';
import { type ChecksecInput, ChecksecInputSchema, IChecksecTool } from './checksec';

const PT_GNU_STACK = 0x6474e551;
const PT_GNU_RELRO = 0x6474e552;
const ET_DYN = 3;

const ELF_ARCH_NAMES: ReadonlyMap<number, string> = new Map<number, string>([
  [3, 'i386'],
  [8, 'mips'],
  [40, 'arm'],
  [62, 'amd64'],
]);

export class ChecksecTool implements IChecksecTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'Checksec' as const;
  readonly description = CHECKSEC_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ChecksecInputSchema);
  constructor(@IAgentRuntimeService private readonly runtime: IAgentRuntimeService) {}

  resolveExecution(args: ChecksecInput): ToolExecution {
    const inspected = inspectAgentRuntime(this.runtime);
    return {
      accesses: ToolAccesses.none(),
      description: `Checking mitigations of ${args.target}`,
      approvalRule: literalRulePattern(this.name, args.target),
      execute: async () => {
        const lease = this.runtime.acquire(['fs']);
        try {
          if (lease.runtime.identity.generation !== inspected.identity.generation) {
            return { isError: true, output: 'Runtime changed before execution. Retry the tool call.' };
          }
          return await this.execution(lease.runtime.fs!, args);
        } finally {
          lease.dispose();
        }
      },
    };
  }

  private async execution(
    _fs: unknown,
    args: ChecksecInput,
  ): Promise<ExecutableToolResult> {
    const builder = new ToolOutputAccumulator();
    let data: Buffer;
    try {
      data = await readFile(args.target);
    } catch (error) {
      return builder.error(
        `checksec failed on \`${args.target}\`: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (detectFormat(data) !== 'elf' || data.length < 64) {
      return builder.error(
        `\`${args.target}\` is not a readable ELF binary.`,
      );
    }

    const analysis = analyzeElf(data);
    const lines = [
      `File: ${args.target}`,
      `Arch: ${analysis.arch}`,
      `NX: ${fmtBool(analysis.nx)}`,
      `PIE: ${fmtBool(analysis.pie)}`,
      `Canary: ${fmtBool(analysis.canary)}`,
      `RELRO: ${analysis.relro}`,
      `Fortify: ${fmtBool(analysis.fortify)}`,
    ];
    builder.write(lines.join('\n'));
    return builder.ok(`Checked mitigations for ${args.target}.`);
  }
}

interface ElfAnalysis {
  arch: string;
  nx: boolean;
  pie: boolean;
  canary: boolean;
  relro: 'Full RELRO' | 'Partial RELRO' | 'No RELRO';
  fortify: boolean;
}

function analyzeElf(data: Buffer): ElfAnalysis {
  const endian: 'LE' | 'BE' = data[5] === 2 ? 'BE' : 'LE';
  const machine = endian === 'LE' ? data.readUInt16LE(18) : data.readUInt16BE(18);
  const eType = endian === 'LE' ? data.readUInt16LE(16) : data.readUInt16BE(16);
  const phoff = endian === 'LE' ? data.readUInt32LE(28) : data.readUInt32BE(28);
  const phentsize = endian === 'LE' ? data.readUInt16LE(54) : data.readUInt16BE(54);
  const phnum = endian === 'LE' ? data.readUInt16LE(56) : data.readUInt16BE(56);
  const shentsize = endian === 'LE' ? data.readUInt16LE(58) : data.readUInt16BE(58);
  const shoff = endian === 'LE' ? data.readUInt32LE(40) : data.readUInt32BE(40);
  const shnum = endian === 'LE' ? data.readUInt16LE(60) : data.readUInt16BE(60);
  const shstrndx = endian === 'LE' ? data.readUInt16LE(62) : data.readUInt16BE(62);
  const shstr = readShstrtab(data, shoff, shentsize, shnum, shstrndx, endian);

  const arch = ELF_ARCH_NAMES.get(machine) ?? 'unknown';
  const pie = eType === ET_DYN;

  let stackExecutable = false;
  let relroSegment: { off: number; size: number } | null = null;
  for (let i = 0; i < phnum; i += 1) {
    const off = phoff + i * phentsize;
    if (off + 32 > data.length) break;
    const pType = endian === 'LE' ? data.readUInt32LE(off) : data.readUInt32BE(off);
    const pFlags = endian === 'LE' ? data.readUInt32LE(off + 4) : data.readUInt32BE(off + 4);
    const pOffset = endian === 'LE' ? data.readUInt32LE(off + 8) : data.readUInt32BE(off + 8);
    const pFilesz = endian === 'LE' ? data.readUInt32LE(off + 16) : data.readUInt32BE(off + 16);
    if (pType === PT_GNU_STACK) {
      stackExecutable = (pFlags & 1) !== 0;
    }
    if (pType === PT_GNU_RELRO) {
      relroSegment = { off: pOffset, size: pFilesz };
    }
  }
  const nx = !stackExecutable;

  let gotInRelro = false;
  if (relroSegment !== null) {
    for (let i = 0; i < shnum; i += 1) {
      const off = shoff + i * shentsize;
      if (off + 40 > data.length) break;
      const shType = endian === 'LE' ? data.readUInt32LE(off + 4) : data.readUInt32BE(off + 4);
      const shNameOff = endian === 'LE' ? data.readUInt32LE(off) : data.readUInt32BE(off);
      if (shType !== 1) continue;
      const name = sectionNameAt(shstr, shNameOff);
      if (name !== '.got' && name !== '.got.plt') continue;
      const shOffset = endian === 'LE' ? data.readUInt32LE(off + 16) : data.readUInt32BE(off + 16);
      const shSize = endian === 'LE' ? data.readUInt32LE(off + 20) : data.readUInt32BE(off + 20);
      const relroEnd = relroSegment.off + relroSegment.size;
      if (shOffset >= relroSegment.off && shOffset + shSize <= relroEnd) {
        gotInRelro = true;
        break;
      }
    }
  }
  const relro: ElfAnalysis['relro'] =
    relroSegment === null
      ? 'No RELRO'
      : gotInRelro
        ? 'Full RELRO'
        : 'Partial RELRO';

  const canary = data.includes(Buffer.from('__stack_chk_fail'));
  const fortify = data.includes(Buffer.from('__fortify_fail'));

  return { arch, nx, pie, canary, relro, fortify };
}

function readShstrtab(
  data: Buffer,
  shoff: number,
  shentsize: number,
  shnum: number,
  shstrndx: number,
  endian: 'LE' | 'BE',
): Buffer {
  if (shstrndx >= shnum) return Buffer.alloc(0);
  const off = shoff + shstrndx * shentsize;
  if (off + 24 > data.length) return Buffer.alloc(0);
  const strOff = endian === 'LE' ? data.readUInt32LE(off + 16) : data.readUInt32BE(off + 16);
  const strSize = endian === 'LE' ? data.readUInt32LE(off + 20) : data.readUInt32BE(off + 20);
  if (strOff + strSize > data.length) return Buffer.alloc(0);
  return data.subarray(strOff, strOff + strSize);
}

function sectionNameAt(shstr: Buffer, nameOff: number): string {
  if (nameOff >= shstr.length) return '';
  const end = shstr.indexOf(0, nameOff);
  if (end < 0 || end - nameOff > 128) return '';
  return shstr.subarray(nameOff, end).toString('utf8');
}

function fmtBool(value: boolean): string {
  return value ? 'Yes' : 'No';
}

registerAgentToolService(IChecksecTool, ChecksecTool, {
  name: 'Checksec',
  domain: 'os/backends',
  requiredRuntimeCapabilities: ['fs'],
});
