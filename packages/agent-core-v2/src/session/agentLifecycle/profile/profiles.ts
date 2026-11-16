import { collectGitContext } from './gitContext';
import { registerAgentProfile } from '#/app/agentProfileCatalog/contribution';
import {
  renderSystemPromptResult,
  skillActiveFor,
  TASK_AGENT_ROLE_PREFIX,
} from '#/app/agentProfileCatalog/profile-shared';

import EXPLORE_ROLE from './explore-overlay.md?raw';
import './reverser';

const AGENT_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'Bash',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'WaitFor',
  'CronCreate',
  'CronList',
  'CronDelete',
  'ReadMediaFile',
  'TodoList',
  'Skill',
  'WebSearch',
  'Agent',
  'AgentSwarm',
  'FetchURL',
  'AskUserQuestion',
  'NotifyUser',
  'ExitPlanMode',
  'CreateGoal',
  'GetGoal',
  'SetGoalBudget',
  'UpdateGoal',
  'TowerInit',
  'TowerStatus',
  'TowerTeardown',
  'mcp__*',
] as const;

const CODER_TOOLS = [
  'NotifyUser',
  'Bash',
  'CronCreate',
  'CronDelete',
  'CronList',
  'Edit',
  'Glob',
  'Grep',
  'Read',
  'ReadMediaFile',
  'Skill',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'TodoList',
  'WaitFor',
  'WebSearch',
  'FetchURL',
  'Write',
  'mcp__*',
] as const;

const EXPLORE_TOOLS = [
  'NotifyUser',
  'Bash',
  'Read',
  'ReadMediaFile',
  'Glob',
  'Grep',
  'WebSearch',
  'FetchURL',
] as const;

const CODER_ROLE =
  `${TASK_AGENT_ROLE_PREFIX}\n\n` +
  'Your final message is the entire handoff. ' +
  'Make it technically complete: what you changed and why, the path of every file you touched, ' +
  'how you verified the change (tests or commands run, with results), and anything left undone ' +
  'or worth follow-up. If you are stopped before finishing, the parent receives only what ' +
  'you have written so far, so keep the handoff current.';

const RE_ROUTING =
  '# Routing hints\n\n' +
  'When a request matches one of the domains below, delegate to the `reverser` builtin subagent via the `Agent` tool (`subagent_type="reverser"`), passing the target path and the specific question. Do not attempt these analyses inline — the reverser owns the RE toolset and the session persistence.\n\n' +
  '- **Reverse engineering** of any binary format (ELF, PE, MIPS/x86-64/ARM, firmware images): identify, disassemble, decompile → `reverser`.\n' +
  '- **Mitigations / exploitation strategy**: NX, PIE/ASLR, RELRO, stack canary, fortify, and how to bypass them → `reverser` (it runs `Checksec` first).\n' +
  '- **ROP / heap / format-string / ret2libc / SROP analysis** → `reverser` (gadget search via `ROP`, one-gadget offsets via `OneGadget`).\n' +
  '- **Exploit development** — turning a completed analysis into a PoC: `reverser` + `ExploitTemplate`, then refine the rendered skeleton against the target.\n' +
  '- **Firmware RE** (router/IoT embedded binaries): always `reverser`.\n\n' +
  'Use `plan` / `explore` subagents **only** for pure planning or read-only exploration. Do not send RE or exploit-development work to them.';

registerAgentProfile({
  name: 'agent',
  description: 'Default agent',
  tools: AGENT_TOOLS,
  subagents: ['coder', 'explore', 'plan', 'reverser'],
  renderSystemPrompt: (context) =>
    renderSystemPromptResult(RE_ROUTING, context, { skillActive: skillActiveFor(AGENT_TOOLS) }),
});

registerAgentProfile({
  name: 'coder',
  description:
    'General software engineering agent — the only subagent type with file-editing tools; use it for any delegated task that must modify code.',
  whenToUse:
    'Use this agent for non-trivial software engineering work that may require reading files, editing code, running commands, and returning a compact but technically complete summary to the parent agent.',
  tools: CODER_TOOLS,
  renderSystemPrompt: (context) =>
    renderSystemPromptResult(CODER_ROLE, context, { skillActive: skillActiveFor(CODER_TOOLS) }),
});

registerAgentProfile({
  name: 'explore',
  description: 'Fast codebase exploration with prompt-enforced read-only behavior.',
  whenToUse:
    'Fast agent specialized for exploring codebases: it finds files by patterns (e.g. "src/**/*.yaml"), searches code for keywords (e.g. "database connection"), and answers questions about the codebase (e.g. "how does the auth module work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "thorough" for comprehensive analysis across multiple locations and naming conventions.',
  tools: EXPLORE_TOOLS,
  renderSystemPrompt: (context) =>
    renderSystemPromptResult(`${TASK_AGENT_ROLE_PREFIX}\n\n${EXPLORE_ROLE.trim()}`, context, {
      skillActive: skillActiveFor(EXPLORE_TOOLS),
      readOnly: true,
    }),
  promptPrefix: async ({ cwd, process, log }) => {
    try {
      return await collectGitContext(process, cwd, log);
    } catch {
      return '';
    }
  },
});
