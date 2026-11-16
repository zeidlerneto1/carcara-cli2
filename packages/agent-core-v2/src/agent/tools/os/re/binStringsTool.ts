import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ExecutableToolResult, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { IAgentRuntimeService, inspectAgentRuntime } from '#/agent/runtimeBinding/agentRuntime';
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
  constructor(@IAgentRuntimeService private readonly runtime: IAgentRuntimeService) {}

  resolveExecution(args: BinStringsInput): ToolExecution {
    const inspected = inspectAgentRuntime(this.runtime);
    return {
      accesses: ToolAccesses.none(),
      description: `Extracting strings from ${args.target}`,
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
  requiredRuntimeCapabilities: ['process'],
});
