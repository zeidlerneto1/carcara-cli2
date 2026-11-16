import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ExecutableToolResult, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { IAgentRuntimeService, inspectAgentRuntime } from '#/agent/runtimeBinding/agentRuntime';
import type { IHostProcessService } from '#/os/interface/hostProcess';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import { unwrapErrorCause } from '#/_base/errors/errors';
import { runCommand } from './shared';
import GHIDRA_DESCRIPTION from './ghidra_decompile.md?raw';
import { GhidraInputSchema, IGhidraTool, type GhidraInput } from './ghidra';
import REOPS_JAVA from './ghidra/ReOps.java?raw';

interface ProjectCache {
  readonly projectDir: string;
  readonly projectName: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class GhidraTool implements IGhidraTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'GhidraDecompile' as const;
  readonly description = GHIDRA_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(GhidraInputSchema);
  private readonly projects = new Map<string, ProjectCache>();
  constructor(@IAgentRuntimeService private readonly runtime: IAgentRuntimeService) {}

  resolveExecution(args: GhidraInput): ToolExecution {
    const inspected = inspectAgentRuntime(this.runtime);
    return {
      accesses: ToolAccesses.none(),
      description: `Ghidra ${args.action} on ${args.target}`,
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
    args: GhidraInput,
  ): Promise<ExecutableToolResult> {
    const builder = new ToolOutputAccumulator();
    const analyzeHeadless = await this.locateAnalyzeHeadless(processService);
    if (analyzeHeadless === null) {
      return builder.error(
        'Ghidra is not available. Install Ghidra and set `$GHIDRA_HOME` to its install directory, or add the `ghidra` command to PATH.',
      );
    }

    const target = args.function ?? args.addr ?? '';
    if (args.action !== 'list_functions' && args.action !== 'decompile' && target.length === 0) {
      return builder.error(`${args.action} requires a \`function\`/\`addr\`.`);
    }
    if (args.action === 'rename' && (target.length === 0 || args.name === undefined)) {
      return builder.error('rename requires both `function` and `name`.');
    }
    if (args.action === 'decompile' && target.length === 0) {
      args = { ...args, action: 'list_functions' };
    }

    try {
      const output = await this.runOp(processService, analyzeHeadless, args, target);
      builder.write(output);
      return builder.ok(`Ghidra ${args.action} on ${args.target} completed.`);
    } catch (error) {
      return builder.error(
        `Ghidra operation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async locateAnalyzeHeadless(
    processService: IHostProcessService,
  ): Promise<string | null> {
    const ghidraHome = process.env['GHIDRA_HOME'];
    const candidates: string[] = [];
    if (ghidraHome !== undefined && ghidraHome.length > 0) {
      candidates.push(join(ghidraHome, 'support', 'analyzeHeadless'));
    }
    const whichGhidra = await runCommand(processService, 'which', ['ghidra']);
    if (whichGhidra.exitCode === 0) {
      const ghidraPath = whichGhidra.output.trim().split('\n')[0];
      if (ghidraPath !== undefined && ghidraPath.length > 0) {
        candidates.push(join(ghidraPath, '..', 'support', 'analyzeHeadless'));
      }
    }
    for (const candidate of candidates) {
      if (await fileExists(candidate)) return candidate;
    }
    return null;
  }

  private async runOp(
    processService: IHostProcessService,
    analyzeHeadless: string,
    args: GhidraInput,
    target: string,
  ): Promise<string> {
    const sha = await sha256(args.target);
    let project = this.projects.get(sha);
    const scriptDir = join(tmpdir(), `re-ghidra-script-${process.pid}`);
    await mkdir(scriptDir, { recursive: true });
    await writeFile(join(scriptDir, 'ReOps.java'), REOPS_JAVA, 'utf8');

    const outPath = join(tmpdir(), `re-ghidra-out-${process.pid}-${Date.now()}.json`);
    const binaryName = args.target.split(/[/\\]/).at(-1) ?? 'binary';

    const base: string[] = [];
    if (project === undefined) {
      const projectDir = join(tmpdir(), `re-ghidra-proj-${sha}`);
      project = { projectDir, projectName: 're' };
      this.projects.set(sha, project);
      await mkdir(projectDir, { recursive: true });
      base.push('-import', args.target);
    } else {
      base.push('-process', binaryName, '-noanalysis');
    }

    const scriptArgs = this.scriptArgs(args, target, outPath);
    const cmd = [
      project.projectDir,
      project.projectName,
      ...base,
      '-scriptPath',
      scriptDir,
      '-postScript',
      'ReOps.java',
      ...scriptArgs,
      '-scriptlog',
      join(tmpdir(), `re-ghidra-log-${process.pid}.txt`),
    ];

    const timeoutMs = Math.max(args.timeout * 1000, DEFAULT_TIMEOUT_MS);
    const result = await runCommand(processService, analyzeHeadless, cmd, { timeoutMs });
    if (result.exitCode !== 0 && !(await fileExists(outPath))) {
      throw new Error(
        `analyzeHeadless exited ${String(result.exitCode)}. ${result.output.trim()}`,
      );
    }
    if (await fileExists(outPath)) {
      const content = await readFile(outPath, 'utf8');
      await rm(outPath, { force: true });
      return content;
    }
    throw new Error('analyzeHeadless produced no output.');
  }

  private scriptArgs(args: GhidraInput, target: string, outPath: string): string[] {
    const targetArg = target.length > 0 ? target : '';
    switch (args.action) {
      case 'list_functions':
        return ['list_functions', outPath];
      case 'xrefs_to':
        return ['xrefs_to', targetArg, outPath];
      case 'call_graph':
        return ['call_graph', targetArg, String(args.depth), outPath];
      case 'rename':
        return ['rename', targetArg, args.name ?? '', outPath];
      default:
        return ['decompile', targetArg, outPath];
    }
  }
}

async function sha256(path: string): Promise<string> {
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    const cause = unwrapErrorCause(error);
    if (cause !== null && typeof cause === 'object' && (cause as { code?: unknown }).code === 'EISDIR') {
      return true;
    }
    return false;
  }
}

registerAgentToolService(IGhidraTool, GhidraTool, {
  name: 'GhidraDecompile',
  domain: 'os/backends',
  requiredRuntimeCapabilities: ['process'],
});
