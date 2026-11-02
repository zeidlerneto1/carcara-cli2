import { SECONDARY_DERIVED_MODEL_ALIAS, type ModelAlias, type ThinkingEffort } from '@moonshot-ai/kimi-code-sdk';

import { TabbedModelSelectorComponent } from '../components/dialogs/tabbed-model-selector';
import { formatErrorMessage } from '../utils/event-payload';
import { setDefaultModel } from './provider';
import type { SlashCommandHost } from './dispatch';

// ---------------------------------------------------------------------------
// /carcara command — configure the Carcará (Sinapad/LNCC) provider without
// login (bypass) and pick a model.
// ---------------------------------------------------------------------------

export const CARCARA_BASE_URL = 'https://carcara.sinapad.lncc.br/service/v1';

/**
 * Models offered by the Carcará endpoint. The chat endpoint works without any
 * session token, so the provider is configured with no credentials (bypass of
 * `carcara-login`).
 */
const CARCARA_MODELS: Readonly<Record<string, ModelAlias>> = {
  'carcara/deepseek': {
    provider: 'carcara',
    model: 'DeepSeek-v4-Flash-0731',
    maxContextSize: 131072,
    capabilities: ['thinking'],
  },
  'carcara/qwen': {
    provider: 'carcara',
    model: 'Qwen3.8-27B',
    maxContextSize: 32768,
  },
};

/** The thinking effort applied when selecting each model as the default. */
function defaultEffortFor(alias: string): ThinkingEffort {
  const caps = CARCARA_MODELS[alias]?.capabilities ?? [];
  return caps.includes('thinking') ? 'on' : 'off';
}

export async function handleCarcaraCommand(host: SlashCommandHost, args: string): Promise<void> {
  const alias = args.trim();

  // Persist the provider (no auth — bypass) and its models.
  try {
    const config = await host.harness.getConfig();
    const providers = {
      ...config.providers,
      carcara: { type: 'carcara' as const, baseUrl: CARCARA_BASE_URL },
    };
    const models = { ...config.models, ...CARCARA_MODELS };
    await host.harness.setConfig({ providers, models });
    await host.authFlow.refreshConfigAfterLogin();
  } catch (error) {
    host.showError(`Failed to set up Carcará: ${formatErrorMessage(error)}`);
    return;
  }

  host.showStatus('Carcará provider configured (no login).');
  host.track('connect', { provider: 'carcara', method: 'bypass' });

  if (alias.length > 0) {
    if (CARCARA_MODELS[alias] === undefined) {
      host.showError(`Unknown Carcará model alias: ${alias}. Available: ${Object.keys(CARCARA_MODELS).join(', ')}`);
      return;
    }
    await setDefaultModel(host, alias, defaultEffortFor(alias));
    return;
  }

  // No alias: offer the model selector for the Carcará models only.
  const stateModels = { ...(await host.harness.getConfig().then((c) => c.models ?? {})) };
  delete stateModels[SECONDARY_DERIVED_MODEL_ALIAS];
  const carcaraModels: Record<string, ModelAlias> = {};
  for (const [modelAlias, model] of Object.entries(stateModels)) {
    if (modelAlias.startsWith('carcara/')) carcaraModels[modelAlias] = model;
  }

  const selector = new TabbedModelSelectorComponent({
    models: carcaraModels,
    currentValue: host.state.appState.model,
    selectedValue: Object.keys(carcaraModels)[0],
    currentThinkingEffort: host.state.appState.thinkingEffort,
    initialTabId: 'carcara',
    title: ' Select a Carcará model',
    onSelect: ({ alias: selected, thinking }) => {
      host.restoreEditor();
      void setDefaultModel(host, selected, thinking).catch((error: unknown) => {
        host.showError(`Set default model failed: ${formatErrorMessage(error)}`);
      });
    },
    onCancel: () => {
      host.restoreEditor();
    },
  });
  host.mountEditorReplacement(selector);
}
