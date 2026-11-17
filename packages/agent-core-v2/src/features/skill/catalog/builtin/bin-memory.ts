import type { SkillDefinition } from '#/features/skill/catalog/types';
import { parseSkillText } from '#/features/skill/catalog/parser';
import BIN_MEMORY_BODY from './bin-memory.md?raw';

const PSEUDO_PATH = 'builtin://bin-memory';

const parsed = parseSkillText({
  skillMdPath: '/builtin/skills/bin-memory.md',
  skillDirName: 'bin-memory',
  source: 'builtin',
  text: BIN_MEMORY_BODY,
});

export const BIN_MEMORY_SKILL: SkillDefinition = {
  ...parsed,
  path: PSEUDO_PATH,
  dir: PSEUDO_PATH,
  metadata: {
    ...parsed.metadata,
    type: parsed.metadata.type ?? 'inline',
  },
};
