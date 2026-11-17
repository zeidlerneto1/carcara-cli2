import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ExecutableToolResult, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { acquireOrWhenReady, IAgentEnvironmentService, pinnedGeneration } from '#/agent/environmentBinding/agentEnvironment';
import type { IHostProcessService } from '#/os/interface/hostProcess';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import { unwrapErrorCause } from '#/_base/errors/errors';
import { runCommand } from './shared';
import ONE_GADGET_DESCRIPTION from './one_gadget.md?raw';
import { type OneGadgetInput, OneGadgetInputSchema, IOneGadgetTool } from './one-gadget';

export class OneGadgetTool implements IOneGadgetTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'OneGadget' as const;
  readonly description = ONE_GADGET_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(OneGadgetInputSchema);
  constructor(@IAgentEnvironmentService private readonly environment: IAgentEnvironmentService) {}

  async resolveExecution(args: OneGadgetInput): Promise<ToolExecution> {
    const resolutionLease = await acquireOrWhenReady(this.environment, ['process']);
    try {
      const inspected = resolutionLease.environment;
      const expectedGeneration = pinnedGeneration(inspected);
      return {
        accesses: ToolAccesses.none(),
        description: `Scanning ${args.libc} for one-gadgets`,
        approvalRule: literalRulePattern(this.name, args.libc),
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
    args: OneGadgetInput,
  ): Promise<ExecutableToolResult> {
    const builder = new ToolOutputAccumulator();
    let result;
    try {
      result = await runCommand(processService, 'one_gadget', [args.libc]);
    } catch (error) {
      const cause = unwrapErrorCause(error);
      if (
        cause !== null &&
        typeof cause === 'object' &&
        (cause as { code?: unknown }).code === 'ENOENT'
      ) {
        return builder.error(
          'The `one_gadget` Ruby gem is not installed. Install it with: `gem install one_gadget`.',
        );
      }
      throw error;
    }
    if (result.exitCode !== 0) {
      return builder.error(
        `one_gadget failed on \`${args.libc}\` (exit ${String(result.exitCode)}).`,
      );
    }
    builder.write(result.output);
    return builder.ok(`Scanned ${args.libc} for one-gadgets.`);
  }
}

registerAgentToolService(IOneGadgetTool, OneGadgetTool, {
  name: 'OneGadget',
  domain: 'os/backends',
  requiredEnvironmentCapabilities: ['process'],
});
