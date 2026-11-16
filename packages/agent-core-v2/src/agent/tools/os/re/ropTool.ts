import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ExecutableToolResult, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { IAgentRuntimeService, inspectAgentRuntime } from '#/agent/runtimeBinding/agentRuntime';
import type { IHostProcessService } from '#/os/interface/hostProcess';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import { unwrapErrorCause } from '#/_base/errors/errors';
import { runCommand, type RunCommandResult } from './shared';
import ROP_DESCRIPTION from './rop.md?raw';
import { type RopInput, RopInputSchema, IRopTool } from './rop';

export class RopTool implements IRopTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ROP' as const;
  readonly description = ROP_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(RopInputSchema);
  constructor(@IAgentRuntimeService private readonly runtime: IAgentRuntimeService) {}

  resolveExecution(args: RopInput): ToolExecution {
    const inspected = inspectAgentRuntime(this.runtime);
    return {
      accesses: ToolAccesses.none(),
      description: `Searching for ROP gadgets in ${args.target}`,
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
    args: RopInput,
  ): Promise<ExecutableToolResult> {
    const builder = new ToolOutputAccumulator();

    const ropgadget = await this.findBinary(processService, 'ROPgadget');
    if (rogadgetAvailable(ropgadget)) {
      const cmd = ['--binary', args.target, '--depth', '10'];
      if (args.pattern.length > 0) cmd.push('--filter', args.pattern);
      const result = await runCommand(processService, 'ROPgadget', cmd, { timeoutMs: 60_000 });
      if (result.exitCode === 0 && result.output.trim().length > 0) {
        builder.write(truncateLines(result.output.split('\n'), args.limit));
        return builder.ok('Found ROP gadgets via ROPgadget.');
      }
    }

    const ropper = await this.findBinary(processService, 'ropper');
    if (ropper !== null) {
      const search = args.pattern.length > 0 ? args.pattern : '; ret';
      const result = await runCommand(processService, 'ropper', ['--file', args.target, '--search', search], {
        timeoutMs: 60_000,
      });
      if (result.exitCode === 0 && result.output.trim().length > 0) {
        builder.write(truncateLines(result.output.split('\n'), args.limit));
        return builder.ok('Found ROP gadgets via ropper.');
      }
    }

    return builder.error(
      'No ROP gadget engine available. Install ROPgadget or ropper (ropper cannot build on Python 3.14 due to a broken filebytes dependency).',
    );
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

function rogadgetAvailable(value: string | null): value is string {
  return value !== null && value.length > 0;
}

function truncateLines(lines: readonly string[], limit: number): string {
  if (lines.length <= limit) return lines.join('\n');
  return `${lines.slice(0, limit).join('\n')}\n... and ${String(lines.length - limit)} more.`;
}

registerAgentToolService(IRopTool, RopTool, {
  name: 'ROP',
  domain: 'os/backends',
  requiredRuntimeCapabilities: ['process'],
});
