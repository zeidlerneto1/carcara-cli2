import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { ISessionWorkspaceContext } from '#/session/workspaceContext/workspaceContext';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import PERSIST_SESSION_DESCRIPTION from './persist_session.md?raw';
import {
  type PersistSessionInput,
  PersistSessionInputSchema,
  IPersistSessionTool,
} from './persist-session';

export class PersistSessionTool implements IPersistSessionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'PersistSession' as const;
  readonly description = PERSIST_SESSION_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(PersistSessionInputSchema);
  constructor(@ISessionWorkspaceContext private readonly workspaceCtx: ISessionWorkspaceContext) {}

  resolveExecution(args: PersistSessionInput): ToolExecution {
    const revDir = `${this.workspaceCtx.workDir}/rev`;
    const revFile = `${revDir}/${args.target}.md`;

    return {
      accesses: ToolAccesses.writeFile(revFile),
      description: `Persisting analysis for ${args.target}`,
      approvalRule: literalRulePattern(this.name, args.target),
      execute: async () => {
        const builder = new ToolOutputAccumulator();
        if (isUnsafeTarget(args.target)) {
          return builder.error(
            `Invalid target \`${args.target}\`: plain file name, no separators or \`..\`.`,
          );
        }
        let content = args.notes;
        if (args.merge) {
          let existing: string | null = null;
          try {
            existing = await readFile(revFile, 'utf8');
          } catch {
            existing = null;
          }
          if (existing !== null) {
            const toolsSection = extractToolsSection(existing);
            if (toolsSection.length > 0) {
              content = `${toolsSection}\n${args.notes}`;
            }
          }
        }
        try {
          await mkdir(revDir, { recursive: true });
          await writeFile(revFile, content, 'utf8');
        } catch (error) {
          return builder.error(
            `Cannot persist to ${revFile}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        builder.write(revFile);
        return builder.ok(`Persisted analysis to ${revFile}.`);
      },
    };
  }
}

function isUnsafeTarget(target: string): boolean {
  return target.includes('/') || target.includes('\\') || target.includes('..');
}

function extractToolsSection(text: string): string {
  const lines = text.split('\n');
  let start = -1;
  for (let idx = 0; idx < lines.length; idx += 1) {
    if (lines[idx]!.trim() === '## Ferramentas') {
      start = idx;
      break;
    }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let jdx = start + 1; jdx < lines.length; jdx += 1) {
    if (lines[jdx]!.startsWith('## ')) {
      end = jdx;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

registerAgentToolService(IPersistSessionTool, PersistSessionTool, {
  name: 'PersistSession',
  domain: 'os/backends',
});
