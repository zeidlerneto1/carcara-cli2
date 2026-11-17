import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { KimiConfig } from '@moonshot-ai/kimi-code-sdk';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleCarcaraLogin,
  handleCarcaraLogout,
  registerCarcaraCommand,
  type CarcaraDeps,
} from '#/cli/sub/carcara';

const BASE_URL = 'https://carcara.sinapad.lncc.br/service/v1';

class ExitCalled extends Error {
  constructor(public readonly code: number) {
    super(`exit(${code})`);
  }
}

interface FakeHarness {
  ensureConfigFile: () => Promise<void>;
  getConfig: () => Promise<KimiConfig>;
  setConfig: (patch: Partial<KimiConfig>) => Promise<KimiConfig>;
  close: () => Promise<void>;
}

let homeDir: string;

beforeEach(() => {
  homeDir = mkdtempSync(join(tmpdir(), 'carcara-cli-'));
  vi.stubEnv('KIMI_CODE_HOME', homeDir);
});

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function makeHarness(initial: KimiConfig): {
  harness: FakeHarness;
  current: () => KimiConfig;
  setConfigCalls: Array<Partial<KimiConfig>>;
} {
  let persisted: KimiConfig = structuredClone(initial);
  const setConfigCalls: Array<Partial<KimiConfig>> = [];
  const harness: FakeHarness = {
    ensureConfigFile: async () => {},
    getConfig: async () => structuredClone(persisted),
    setConfig: async (patch) => {
      setConfigCalls.push(structuredClone(patch));
      const next: Record<string, unknown> = { ...persisted };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        next[key] = value;
      }
      persisted = next as KimiConfig;
      return structuredClone(persisted);
    },
    close: async () => {},
  };
  return { harness, current: () => persisted, setConfigCalls };
}

function makeDeps(harness: FakeHarness, overrides: Partial<CarcaraDeps> = {}): {
  deps: CarcaraDeps;
  stdout: string[];
  stderr: string[];
  exitCodes: number[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const deps: CarcaraDeps = {
    getHarness: () => harness as unknown as CarcaraDeps['getHarness'] extends () => infer R
      ? R
      : never,
    stdout: { write: (chunk: string) => (stdout.push(chunk), true) },
    stderr: { write: (chunk: string) => (stderr.push(chunk), true) },
    env: {},
    exit: ((code: number) => {
      exitCodes.push(code);
      throw new ExitCalled(code);
    }) as CarcaraDeps['exit'],
    ...overrides,
  };
  return { deps, stdout, stderr, exitCodes };
}

async function tryRun<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ExitCalled) return undefined;
    throw error;
  }
}

function stubLoginFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/apps/login/action/loginAction.php')) {
        const headers = new Headers();
        headers.set('set-cookie', 'PHPSESSID=session-42; path=/');
        return new Response(JSON.stringify({ status: 'OK' }), { status: 200, headers });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }),
  );
}

describe('handleCarcaraLogin', () => {
  it('configures the provider, models, and default model when none is set', async () => {
    stubLoginFetch();
    const { harness, current, setConfigCalls } = makeHarness({ providers: {} } as KimiConfig);
    const { deps, stdout, stderr, exitCodes } = makeDeps(harness, { env: { CARCARA_USER: 'alice' } });

    await tryRun(() => handleCarcaraLogin(deps, { password: 'secret' }));

    expect(exitCodes).toEqual([]);
    expect(stderr.join('')).toBe('');
    const config = current();
    expect(config.providers['carcara']).toMatchObject({
      type: 'carcara',
      baseUrl: BASE_URL,
      customHeaders: {
        Accept: '*/*',
        Referer: 'https://carcara.sinapad.lncc.br/service/',
        Origin: 'https://carcara.sinapad.lncc.br',
        Cookie: 'PHPSESSID=session-42',
      },
    });
    expect(config.models?.['carcara/deepseek']).toMatchObject({
      provider: 'carcara',
      model: 'DeepSeek-v4-Flash-0731',
      maxContextSize: 131072,
      capabilities: ['thinking'],
    });
    expect(config.models?.['carcara/qwen']).toMatchObject({
      provider: 'carcara',
      model: 'Qwen3.8-27B',
      maxContextSize: 32768,
    });
    expect(config.defaultModel).toBe('carcara/deepseek');
    expect(setConfigCalls[0]?.defaultModel).toBe('carcara/deepseek');
    expect(stdout.join('')).toContain('Logged in to Carcará');
  });

  it('preserves an existing default model', async () => {
    stubLoginFetch();
    const initial = {
      providers: { openai: { type: 'openai' } },
      models: { 'openai/gpt': { provider: 'openai', model: 'gpt', maxContextSize: 1024 } },
      defaultModel: 'openai/gpt',
    } as unknown as KimiConfig;
    const { harness, current, setConfigCalls } = makeHarness(initial);
    const { deps, exitCodes } = makeDeps(harness, { env: { CARCARA_USER: 'alice' } });

    await tryRun(() => handleCarcaraLogin(deps, { password: 'secret' }));

    expect(exitCodes).toEqual([]);
    expect(current().defaultModel).toBe('openai/gpt');
    expect(setConfigCalls[0]?.defaultModel).toBeUndefined();
  });

  it('exits 1 when the username is missing', async () => {
    const { harness } = makeHarness({ providers: {} } as KimiConfig);
    const { deps, stderr, exitCodes } = makeDeps(harness);

    await tryRun(() => handleCarcaraLogin(deps, {}));

    expect(exitCodes).toEqual([1]);
    expect(stderr.join('')).toContain('Missing Carcará username');
  });

  it('configures the provider without authentication when --dev is set', async () => {
    const { harness, current, setConfigCalls } = makeHarness({ providers: {} } as KimiConfig);
    const { deps, stdout, exitCodes } = makeDeps(harness);

    await tryRun(() => handleCarcaraLogin(deps, { dev: true }));

    expect(exitCodes).toEqual([]);
    const provider = current().providers['carcara'];
    expect(provider).toMatchObject({
      type: 'carcara',
      baseUrl: BASE_URL,
    });
    expect(provider?.customHeaders).not.toHaveProperty('Cookie');
    expect(provider?.customHeaders).toMatchObject({
      Accept: '*/*',
      Referer: 'https://carcara.sinapad.lncc.br/service/',
      Origin: 'https://carcara.sinapad.lncc.br',
    });
    expect(current().defaultModel).toBe('carcara/deepseek');
    expect(setConfigCalls[0]?.defaultModel).toBe('carcara/deepseek');
    expect(stdout.join('')).toContain('without authentication');
  });
});

describe('handleCarcaraLogout', () => {
  it('removes the saved session', async () => {
    const { harness } = makeHarness({ providers: {} } as KimiConfig);
    const { deps, stdout, exitCodes } = makeDeps(harness);

    await tryRun(() => handleCarcaraLogout(deps, {}));

    expect(exitCodes).toEqual([]);
    expect(stdout.join('')).toContain('No Carcará session found');
  });
});

describe('registerCarcaraCommand', () => {
  it('describes the login and logout subcommands', () => {
    const program = new Command('kimi');
    registerCarcaraCommand(program);
    expect(program.commands.find((c) => c.name() === 'carcara-login')?.description()).toMatch(
      /Carcará/i,
    );
    expect(program.commands.find((c) => c.name() === 'carcara-logout')?.description()).toMatch(
      /Carcará/i,
    );
  });
});
