import type { SkillDefinition } from '#/features/skill/catalog/types';
import { parseSkillText } from '#/features/skill/catalog/parser';
import GHIDRA_WORKFLOW_BODY from './ghidra-workflow.md?raw';

const PSEUDO_PATH = 'builtin://ghidra-workflow';

const parsed = parseSkillText({
  skillMdPath: '/builtin/skills/ghidra-workflow.md',
  skillDirName: 'ghidra-workflow',
  source: 'builtin',
  text: GHIDRA_WORKFLOW_BODY,
});

export const GHIDRA_WORKFLOW_SKILL: SkillDefinition = {
  ...parsed,
  path: PSEUDO_PATH,
  dir: PSEUDO_PATH,
  metadata: {
    ...parsed.metadata,
    type: parsed.metadata.type ?? 'inline',
  },
};
