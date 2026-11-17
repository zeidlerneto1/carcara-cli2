import { ToolOutputAccumulator } from '#/tool/output-accumulator';
import { ToolAccesses, type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import REF_RE_DESCRIPTION from './ref_re.md?raw';
import BYPASS from './reference/bypass.md?raw';
import CHECKLISTS from './reference/checklists.md?raw';
import FUZZING from './reference/fuzzing.md?raw';
import LEGAL from './reference/legal.md?raw';
import MEMORY from './reference/memory.md?raw';
import MITIGATIONS from './reference/mitigations.md?raw';
import REPORT from './reference/report.md?raw';
import TECHNIQUES from './reference/techniques.md?raw';
import { type RefReInput, RefReInputSchema, IRefReTool } from './ref-re';

const TOPICS = [
  'mitigations',
  'bypass',
  'memory',
  'techniques',
  'fuzzing',
  'report',
  'checklists',
  'legal',
] as const;

const REFERENCE_CONTENT: ReadonlyMap<string, string> = new Map<string, string>([
  ['mitigations', MITIGATIONS],
  ['bypass', BYPASS],
  ['memory', MEMORY],
  ['techniques', TECHNIQUES],
  ['fuzzing', FUZZING],
  ['report', REPORT],
  ['checklists', CHECKLISTS],
  ['legal', LEGAL],
]);

export class RefReTool implements IRefReTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'RefRE' as const;
  readonly description = REF_RE_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(RefReInputSchema);

  resolveExecution(args: RefReInput): ToolExecution {
    return {
      accesses: ToolAccesses.none(),
      description: `Looking up reference topic ${args.topic}`,
      approvalRule: literalRulePattern(this.name, args.topic),
      execute: async () => {
        const content = REFERENCE_CONTENT.get(args.topic);
        if (content === undefined) {
          const builder = new ToolOutputAccumulator();
          builder.write(
            `Unknown reference topic \`${args.topic}\`.\nValid topics: ${TOPICS.join(', ')}.`,
          );
          return builder.error(`Unknown reference topic \`${args.topic}\`.`);
        }
        const builder = new ToolOutputAccumulator();
        builder.write(content.trimEnd());
        return builder.ok(`Loaded reference topic: ${args.topic}.`);
      },
    };
  }
}

registerAgentToolService(IRefReTool, RefReTool, {
  name: 'RefRE',
  domain: 'os/backends',
});
