import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  CarcaraLoginError,
  carcaraOrigin,
  carcaraSessionFileName,
  deleteCarcaraSession,
  loadCarcaraSession,
  loginCarcara,
  saveCarcaraSession,
  type CarcaraSession,
} from '#/llm-adapter/carcara/session';
import { carcaraEndpoint, carcaraOpenAIProtocol } from '#/llm-adapter/carcara/trait';

const BASE_URL = 'https://carcara.sinapad.lncc.br/service/v1';
const ORIGIN = 'https://carcara.sinapad.lncc.br';

const homeDir = mkdtempSync(join(tmpdir(), 'carcara-test-'));

function session(): CarcaraSession {
  return { baseUrl: BASE_URL, user: 'alice', domain: 'LNCC', phpsessid: 'abc123' };
}

describe('carcaraOrigin', () => {
  it('derives the host root from a base url', () => {
    expect(carcaraOrigin(BASE_URL)).toBe(ORIGIN);
    expect(carcaraOrigin('http://example.com:8080/foo/bar')).toBe('http://example.com:8080');
  });
});

describe('carcaraSessionFileName', () => {
  it('keys the file by host', () => {
    expect(carcaraSessionFileName(BASE_URL)).toBe('carcara-carcara.sinapad.lncc.br.json');
  });
});

describe('carcara session round-trip', () => {
  it('saves, loads, and deletes a session per host', () => {
    saveCarcaraSession(session(), homeDir);
    expect(loadCarcaraSession(BASE_URL, homeDir)).toEqual(session());

    expect(loadCarcaraSession(undefined, homeDir)).toEqual(session());
    expect(deleteCarcaraSession(BASE_URL, homeDir)).toBe(true);
    expect(loadCarcaraSession(BASE_URL, homeDir)).toBeUndefined();
  });

  it('returns undefined when no session exists', () => {
    expect(loadCarcaraSession(BASE_URL, homeDir)).toBeUndefined();
    expect(deleteCarcaraSession(BASE_URL, homeDir)).toBe(false);
  });

  it('ignores corrupt session files', () => {
    saveCarcaraSession(session(), homeDir);
    writeFileSync(join(homeDir, 'credentials', carcaraSessionFileName(BASE_URL)), '{not valid json');
    expect(loadCarcaraSession(BASE_URL, homeDir)).toBeUndefined();
  });
});

function stubLoginFetch(status: string, setCookie: string | undefined): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const headers = new Headers();
      if (setCookie !== undefined) {
        headers.set('set-cookie', setCookie);
      }
      return new Response(JSON.stringify({ status }), { status: 200, headers });
    }),
  );
}

describe('loginCarcara', () => {
  it('logs in and validates a session', async () => {
    const calls: Array<{ url: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url });
        if (url.endsWith('/apps/login/action/loginAction.php')) {
          const headers = new Headers();
          headers.set('set-cookie', 'PHPSESSID=session-42; path=/');
          return new Response(JSON.stringify({ status: 'OK' }), { status: 200, headers });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }),
    );

    const result = await loginCarcara(BASE_URL, 'alice', 'secret', 'LNCC');

    expect(result).toEqual({
      baseUrl: BASE_URL,
      user: 'alice',
      domain: 'LNCC',
      phpsessid: 'session-42',
    });
    expect(calls.length).toBe(2);
    expect(calls[0]!.url).toBe(`${ORIGIN}/apps/login/action/loginAction.php`);
    expect(calls[1]!.url).toBe(`${BASE_URL}/models`);
  });

  it('throws when the login is rejected', async () => {
    stubLoginFetch('error', 'PHPSESSID=x');
    await expect(loginCarcara(BASE_URL, 'alice', 'wrong', 'LNCC')).rejects.toThrow(
      CarcaraLoginError,
    );
  });

  it('throws when the login returns no PHPSESSID cookie', async () => {
    stubLoginFetch('OK', undefined);
    await expect(loginCarcara(BASE_URL, 'alice', 'secret', 'LNCC')).rejects.toThrow(
      CarcaraLoginError,
    );
  });
});

describe('carcaraOpenAIProtocol', () => {
  it('maps thinking effort to chat_template_kwargs and budget', () => {
    const contribution = carcaraOpenAIProtocol.thinking(
      { effort: 'high' },
      { model: null as never } as never,
    );
    expect(contribution).toEqual({
      chat_template_kwargs: { enable_thinking: true },
      thinking_budget_tokens: 8192,
    });
  });

  it('disables thinking on off', () => {
    const contribution = carcaraOpenAIProtocol.thinking(
      { effort: 'off' },
      { model: null as never } as never,
    );
    expect(contribution).toEqual({
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it('merges the extra body and sampling params', () => {
    const native = {
      system: undefined,
      messages: [],
      tools: [],
      params: {},
    };
    const module = {
      model: { spec: { name: 'DeepSeek' } },
      profile: {},
      content: { messages: [] },
      options: {},
    };
    const request = carcaraOpenAIProtocol.flatten(native as never, module as never);
    expect((request.params as Record<string, unknown>)['extra_body']).toMatchObject({
      return_progress: true,
      reasoning_format: 'auto',
      reasoning_control: true,
      backend_sampling: false,
      timings_per_token: true,
    });
  });
});

describe('carcaraEndpoint', () => {
  it('exposes the base url env binding', () => {
    expect(carcaraEndpoint).toEqual({ baseUrlEnv: 'CARCARA_BASE_URL' });
  });
});
