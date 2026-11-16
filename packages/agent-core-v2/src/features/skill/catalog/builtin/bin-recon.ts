import type { SkillDefinition } from '#/features/skill/catalog/types';
import { parseSkillText } from '#/features/skill/catalog/parser';
import BIN_RECON_BODY from './bin-recon.md?raw';

const PSEUDO_PATH = 'builtin://bin-recon';

const parsed = parseSkillText({
  skillMdPath: '/builtin/skills/bin-recon.md',
  skillDirName: 'bin-recon',
  source: 'builtin',
  text: BIN_RECON_BODY,
});

export const BIN_RECON_SKILL: SkillDefinition = {
  ...parsed,
  path: PSEUDO_PATH,
  dir: PSEUDO_PATH,
  metadata: {
    ...parsed.metadata,
    type: parsed.metadata.type ?? 'inline',
  },
};
