import { readFile } from 'node:fs/promises';

import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ExecutableToolResult, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { acquireOrWhenReady, IAgentEnvironmentService, pinnedGeneration } from '#/agent/environmentBinding/agentEnvironment';
import type { IHostProcessService } from '#/os/interface/hostProcess';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import { unwrapErrorCause } from '#/_base/errors/errors';
import { detectElf, detectFormat, runCommand, type ReArch, type RunCommandResult } from './shared';
import EMULATE_DESCRIPTION from './emulate.md?raw';
import { type EmulateInput, EmulateInputSchema, IEmulateTool } from './emulate';

function qemuBinary(arch: ReArch, endian: 'big' | 'little'): string | null {
  switch (arch) {
    case 'x86':
      return 'qemu-i386';
    case 'x86_64':
      return 'qemu-x86_64';
    case 'arm':
      return 'qemu-arm';
    case 'mips':
      return endian === 'big' ? 'qemu-mips' : 'qemu-mipsel';
  }
}

export class EmulateTool implements IEmulateTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'Emulate' as const;
  readonly description = EMULATE_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(EmulateInputSchema);
  constructor(@IAgentEnvironmentService private readonly environment: IAgentEnvironmentService) {}

  async resolveExecution(args: EmulateInput): Promise<ToolExecution> {
    const resolutionLease = await acquireOrWhenReady(this.environment, ['process']);
    try {
      const inspected = resolutionLease.environment;
      const expectedGeneration = pinnedGeneration(inspected);
      return {
        accesses: ToolAccesses.none(),
        description: `Emulating ${args.target} under qemu-user`,
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
    args: EmulateInput,
  ): Promise<ExecutableToolResult> {
    const builder = new ToolOutputAccumulator();

    let header: Buffer;
    try {
      header = (await readFile(args.target)).subarray(0, 64);
    } catch (error) {
      return builder.error(`Could not read \`${args.target}\`: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (detectFormat(header) !== 'elf') {
      return builder.error(`\`${args.target}\` is not an ELF binary; qemu-user cannot run PE or other formats.`);
    }

    let arch: ReArch | null;
    let endian: 'big' | 'little';
    const detected = detectElf(header);
    arch = detected.arch;
    endian = detected.endian ?? 'little';
    if (args.arch !== undefined) arch = args.arch;
    if (args.endian !== undefined) endian = args.endian;
    if (arch === null) {
      return builder.error(
        `Could not auto-detect the architecture of \`${args.target}\`; pass \`arch\` explicitly.`,
      );
    }

    const qemu = qemuBinary(arch, endian);
    if (qemu === null) {
      return builder.error(`No qemu-user binary maps to architecture \`${arch}\`.`);
    }
    const found = await this.findBinary(processService, qemu);
    if (found === null) {
      return builder.error(
        `\`${qemu}\` is not available. Install it (e.g. \`apt install qemu-user\`) to emulate ${arch}.`,
      );
    }

    const cmd = [qemu];
    if (args.sysroot !== undefined && args.sysroot.length > 0) cmd.push('-L', args.sysroot);
    cmd.push(args.target, ...args.args);

    const result = await runCommand(processService, qemu, cmd.slice(1), {
      timeoutMs: args.timeout_ms,
      stdin: args.stdin,
      env: args.env,
    });

    const out = result.output.trim();
    const headerLine = `Emulated ${args.target} (${arch}${endian === 'big' ? ' big-endian' : ''}) via ${qemu}`;
    if (out.length > 0) {
      builder.write(headerLine);
      builder.write(out);
    }
    const suffix = result.timedOut ? ' (timed out)' : '';
    if (result.exitCode !== 0) {
      return builder.error(`${headerLine} exited with code ${String(result.exitCode)}${suffix}`);
    }
    return builder.ok(`${headerLine} exited with code 0${suffix}`);
  }

  private async findBinary(
    processService: IHostProcessService,
    name: string,
  ): Promise<string | null> {
    let result: RunCommandResult;
    try {
      result = await runCommand(processService, 'which', [name]);
    } catch (error) {
      const cause = unwrapErrorCause(error);
      if (cause !== null && typeof cause === 'object' && (cause as { code?: unknown }).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
    const path = result.output.trim().split('\n')[0];
    return result.exitCode === 0 && path !== undefined && path.length > 0 ? path : null;
  }
}

registerAgentToolService(IEmulateTool, EmulateTool, {
  name: 'Emulate',
  domain: 'os/backends',
  requiredEnvironmentCapabilities: ['process'],
});
