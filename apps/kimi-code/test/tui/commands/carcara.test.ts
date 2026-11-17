/**
 * Scenario: /carcara configures the Carcará provider without login (bypass)
 * and lets the user pick a model.
 * Run: pnpm -C apps/kimi-code exec vitest run test/tui/commands/carcara.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

import type { SlashCommandHost } from '#/tui/commands';
import { CARCARA_BASE_URL, handleCarcaraCommand } from '#/tui/commands/carcara';

function makeHost(options: { existingConfig?: Record<string, unknown> } = {}) {
  const appState = {
    model: '',
    thinkingEffort: 'off',
    availableModels: {},
    availableProviders: {},
  };
  const host = {
    state: { appState },
    session: undefined,
    waitForLazyCreation: vi.fn(async () => {}),
    harness: {
      getConfig: vi.fn(async () => options.existingConfig ?? {}),
      setConfig: vi.fn(async (patch: unknown) => patch),
    },
    authFlow: {
      refreshConfigAfterLogin: vi.fn(async () => false),
    },
    mountEditorReplacement: vi.fn(),
    restoreEditor: vi.fn(),
    showStatus: vi.fn(),
    showError: vi.fn(),
    track: vi.fn(),
  } as unknown as SlashCommandHost & {
    harness: {
      getConfig: ReturnType<typeof vi.fn>;
      setConfig: ReturnType<typeof vi.fn>;
    };
    authFlow: { refreshConfigAfterLogin: ReturnType<typeof vi.fn> };
    waitForLazyCreation: ReturnType<typeof vi.fn>;
    mountEditorReplacement: ReturnType<typeof vi.fn>;
    restoreEditor: ReturnType<typeof vi.fn>;
    showStatus: ReturnType<typeof vi.fn>;
    showError: ReturnType<typeof vi.fn>;
    track: ReturnType<typeof vi.fn>;
  };
  return { host };
}

describe('handleCarcaraCommand', () => {
  it('configures the carcara provider without auth (bypass) and persists its models', async () => {
    const { host } = makeHost();

    await handleCarcaraCommand(host, '');

    const setConfig = host.harness.setConfig.mock.calls[0]![0] as {
      providers: Record<string, unknown>;
      models: Record<string, unknown>;
    };
    expect(setConfig.providers['carcara']).toEqual({
      type: 'carcara',
      baseUrl: CARCARA_BASE_URL,
    });
    // Bypass: no customHeaders / cookie / apiKey on the provider.
    expect(setConfig.providers['carcara']).not.toHaveProperty('customHeaders');
    expect(setConfig.providers['carcara']).not.toHaveProperty('apiKey');
    expect(setConfig.models['carcara/deepseek']).toBeDefined();
    expect(setConfig.models['carcara/qwen']).toBeDefined();
    expect(host.authFlow.refreshConfigAfterLogin).toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('Carcará provider configured'),
    );
    expect(host.track).toHaveBeenCalledWith('connect', { provider: 'carcara', method: 'bypass' });
  });

  it('opens the model selector when no alias is given', async () => {
    const { host } = makeHost();

    await handleCarcaraCommand(host, '');

    expect(host.mountEditorReplacement).toHaveBeenCalled();
  });

  it('sets the default model directly when a valid alias is given', async () => {
    const { host } = makeHost();

    await handleCarcaraCommand(host, 'carcara/qwen');

    // setDefaultModel persists defaultModel through harness.setConfig.
    const setConfigCalls = host.harness.setConfig.mock.calls;
    const lastCall = setConfigCalls.at(-1)![0] as Record<string, unknown>;
    expect(lastCall['defaultModel']).toBe('carcara/qwen');
    // No selector is mounted for a direct pick.
    expect(host.mountEditorReplacement).not.toHaveBeenCalled();
  });

  it('rejects an unknown alias', async () => {
    const { host } = makeHost();

    await handleCarcaraCommand(host, 'carcara/does-not-exist');

    expect(host.showError).toHaveBeenCalledWith(
      expect.stringContaining('Unknown Carcará model alias'),
    );
  });
});
