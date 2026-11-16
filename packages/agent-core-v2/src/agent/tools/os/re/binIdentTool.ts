import { readFile } from 'node:fs/promises';

import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ExecutableToolResult, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { IAgentRuntimeService, inspectAgentRuntime } from '#/agent/runtimeBinding/agentRuntime';
import type { IHostProcessService } from '#/os/interface/hostProcess';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import { runCommand, detectFormat } from './shared';
import BIN_IDENT_DESCRIPTION from './bin_ident.md?raw';
import { type BinIdentInput, BinIdentInputSchema, IBinIdentTool } from './bin-ident';

export class BinIdentTool implements IBinIdentTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'BinIdent' as const;
  readonly description = BIN_IDENT_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(BinIdentInputSchema);
  constructor(@IAgentRuntimeService private readonly runtime: IAgentRuntimeService) {}

  resolveExecution(args: BinIdentInput): ToolExecution {
    const inspected = inspectAgentRuntime(this.runtime);
    return {
      accesses: ToolAccesses.none(),
      description: `Identifying binary ${args.target}`,
      approvalRule: literalRulePattern(this.name, args.target),
      execute: async () => {
        const lease = this.runtime.acquire(['process']);
        try {
          if (lease.runtime.identity.generation !== inspected.identity.generation) {
            return { isError: true, output: 'Runtime changed before execution. Retry the tool call.' };
          }
          return await this.execution(lease.runtime.process!, args);
        } finally {
          lease.dispose();
        }
      },
    };
  }

  private async execution(
    processService: IHostProcessService,
    args: BinIdentInput,
  ): Promise<ExecutableToolResult> {
    const builder = new ToolOutputAccumulator();
    let magic: Buffer;
    try {
      const bytes = await readFile(args.target);
      magic = bytes.subarray(0, 4);
    } catch {
      return builder.error(`Cannot read \`${args.target}\`.`);
    }

    const fileResult = await runCommand(processService, 'file', [args.target]);
    if (fileResult.exitCode !== 0) {
      return builder.error(
        `\`file\` failed on \`${args.target}\` (exit ${String(fileResult.exitCode)}).`,
      );
    }
    builder.write(fileResult.output);

    const fmt = detectFormat(magic);
    const detailCmds: ReadonlyArray<readonly string[]> =
      fmt === 'elf'
        ? [['readelf', '-h', '-l', '-S', '-d', args.target]]
        : fmt === 'pe'
          ? [
              ['objdump', '-f', args.target],
              ['objdump', '-h', args.target],
            ]
          : [];

    for (const cmd of detailCmds) {
      const detail = await runCommand(processService, cmd[0]!, cmd.slice(1));
      if (detail.exitCode !== 0) {
        return builder.error(
          `\`${cmd[0]}\` failed on \`${args.target}\` (exit ${String(detail.exitCode)}).`,
        );
      }
      builder.write(detail.output);
    }

    return builder.ok(`Identified binary: ${args.target}.`);
  }
}

registerAgentToolService(IBinIdentTool, BinIdentTool, {
  name: 'BinIdent',
  domain: 'os/backends',
  requiredRuntimeCapabilities: ['process'],
});
