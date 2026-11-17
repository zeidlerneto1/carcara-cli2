import { createRequester } from '#human/llm/requester';
import type { LlmEndpoint } from '#human/llm/request';
import { openAIProtocol } from '#human/llm/builtin/protocol/openai/index';
import type { ProtocolEndpoint } from '#human/llm-requester/connection';

import { CARCARA_DEFAULT_BASE_URL } from './session';

export const CARCARA_BASE_URL_ENV = 'CARCARA_BASE_URL';

export const CARCARA_EXTRA_BODY: Readonly<Record<string, unknown>> = {
  return_progress: true,
  reasoning_format: 'auto',
  reasoning_control: true,
  backend_sampling: false,
  timings_per_token: true,
};

const CARCARA_THINKING_BUDGET_MAP: Readonly<Record<string, number>> = {
  low: 512,
  medium: 2048,
  high: 8192,
};

const CARCARA_SAMPLING_ENV_MAP: Readonly<Record<string, string>> = {
  CARCARA_TEMPERATURE: 'temperature',
  CARCARA_DYNATEMP_RANGE: 'dynatemp_range',
  CARCARA_DYNATEMP_EXPONENT: 'dynatemp_exponent',
  CARCARA_TOP_K: 'top_k',
  CARCARA_TOP_P: 'top_p',
  CARCARA_MIN_P: 'min_p',
  CARCARA_XTC_PROBABILITY: 'xtc_probability',
  CARCARA_XTC_THRESHOLD: 'xtc_threshold',
  CARCARA_TYP_P: 'typ_p',
  CARCARA_BACKEND_SAMPLING: 'backend_sampling',
};

function carcaraThinkingParams(thinking: { effort: string } | undefined): Record<string, unknown> | undefined {
  if (thinking === undefined) return undefined;
  const off = thinking.effort === 'off';
  if (off) {
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  const kwargs: Record<string, unknown> = {
    chat_template_kwargs: { enable_thinking: true },
  };
  const budget = CARCARA_THINKING_BUDGET_MAP[thinking.effort];
  if (budget !== undefined) {
    kwargs['thinking_budget_tokens'] = budget;
  }
  return kwargs;
}

export const carcaraOpenAIProtocol = openAIProtocol.with((base) => ({
  thinking: (thinking: { effort: string } | undefined) => carcaraThinkingParams(thinking),
  flatten: (native: Parameters<typeof base.flatten>[0], module: Parameters<typeof base.flatten>[1]) => {
    const { extra_body: extraBody, ...extras } = module.options?.extras ?? {};
    const mergedExtraBody: Record<string, unknown> = {
      ...CARCARA_EXTRA_BODY,
      ...samplingParamsFromEnv(),
    };
    if (extraBody !== null && extraBody !== undefined && typeof extraBody === 'object') {
      Object.assign(mergedExtraBody, extraBody);
    }
    const options = { ...module.options, extras: { ...extras, extra_body: mergedExtraBody } };
    return base.flatten(native, { ...module, options });
  },
}));

export const carcaraEndpoint: ProtocolEndpoint = {
  baseUrlEnv: CARCARA_BASE_URL_ENV,
};

const carcaraLlmEndpoint: LlmEndpoint = {
  defaultBaseUrl: CARCARA_DEFAULT_BASE_URL,
};

export const carcaraRequester = createRequester().with({
  protocol: { base: carcaraOpenAIProtocol, options: { reasoningKey: 'reasoning_content' } },
  endpoint: carcaraLlmEndpoint,
});

function samplingParamsFromEnv(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [envName, fieldName] of Object.entries(CARCARA_SAMPLING_ENV_MAP)) {
    const raw = process.env[envName];
    if (raw === undefined || raw.length === 0) continue;
    const parsed = parseEnvValue(fieldName, raw);
    if (parsed !== undefined) {
      out[fieldName] = parsed;
    }
  }
  return out;
}

function parseEnvValue(fieldName: string, raw: string): unknown {
  if (fieldName === 'backend_sampling') {
    return raw.toLowerCase() === 'true' || raw === '1';
  }
  const asFloat = Number(raw);
  if (Number.isNaN(asFloat)) return undefined;
  if (Number.isInteger(asFloat)) return asFloat;
  return asFloat;
}
