import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ExecutableToolResult, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { acquireOrWhenReady, IAgentEnvironmentService, pinnedGeneration } from '#/agent/environmentBinding/agentEnvironment';
import type { IHostProcessService } from '#/os/interface/hostProcess';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import { runCommand } from './shared';
import BIN_STRINGS_DESCRIPTION from './bin_strings.md?raw';
import { type BinStringsInput, BinStringsInputSchema, IBinStringsTool } from './bin-strings';

export class BinStringsTool implements IBinStringsTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'BinStrings' as const;
  readonly description = BIN_STRINGS_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(BinStringsInputSchema);
  constructor(@IAgentEnvironmentService private readonly environment: IAgentEnvironmentService) {}

  async resolveExecution(args: BinStringsInput): Promise<ToolExecution> {
    const resolutionLease = await acquireOrWhenReady(this.environment, ['process']);
    try {
      const inspected = resolutionLease.environment;
      const expectedGeneration = pinnedGeneration(inspected);
      return {
        accesses: ToolAccesses.none(),
        description: `Extracting strings from ${args.target}`,
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
    args: BinStringsInput,
  ): Promise<ExecutableToolResult> {
    const builder = new ToolOutputAccumulator();
    const result = await runCommand(processService, 'strings', [
      '-n',
      String(args.min_length),
      '-e',
      args.encoding,
      args.target,
    ]);
    if (result.exitCode !== 0) {
      return builder.error(
        `\`strings\` failed on \`${args.target}\` (exit ${String(result.exitCode)}).`,
      );
    }
    builder.write(result.output);
    return builder.ok(`Extracted strings from ${args.target}.`);
  }
}

registerAgentToolService(IBinStringsTool, BinStringsTool, {
  name: 'BinStrings',
  domain: 'os/backends',
  requiredEnvironmentCapabilities: ['process'],
});
