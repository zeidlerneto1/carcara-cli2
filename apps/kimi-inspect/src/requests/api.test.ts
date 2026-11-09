/**
 * Tests for the request journal REST client (`GET /api/v1/debug/requests`):
 * query serialization, envelope unwrapping, and per-kind entry parsing.
 */

import { describe, expect, it } from 'vitest';

import { fetchRequests } from './api';

function okEnvelope(data: unknown) {
  return { code: 0, msg: 'success', data, request_id: 'r1' };
}

function fakeFetch(envelope: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { json: async () => envelope };
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const journalData = [
  {
    kind: 'http',
    ts: 1_700_000_000_000,
    method: 'POST',
    url: '/api/v1/sessions/s1/messages',
    status: 200,
    responseTimeMs: 12.4,
    remoteAddress: '127.0.0.1',
    userAgent: 'kimi-inspect/0.0.0',
    requestId: 'req-1',
    sessionId: 's1',
  },
  {
    kind: 'llm',
    ts: 1_700_000_000_050,
    sessionId: 's1',
    model: 'carcara/deepseek',
    inputTokens: 120,
    outputTokens: 40,
    source: 'chat',
  },
  // Malformed entries are dropped, not fatal.
  { kind: 'http', ts: 1 },
];

describe('fetchRequests', () => {
  it('gets the debug endpoint with bearer auth and maps entries to camelCase', async () => {
    const { calls, fetchImpl } = fakeFetch(okEnvelope(journalData));
    const entries = await fetchRequests({
      baseUrl: 'http://h:1',
      token: 'tok',
      sessionId: 's1',
      kind: 'http',
      limit: 100,
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'http://h:1/api/v1/debug/requests?session_id=s1&kind=http&limit=100',
    );
    expect(calls[0]!.init?.method).toBe('GET');
    expect(calls[0]!.init?.headers).toEqual({ authorization: 'Bearer tok' });

    expect(entries).toHaveLength(2);
    const http = entries[0];
    expect(http?.kind).toBe('http');
    if (http?.kind === 'http') {
      expect(http.method).toBe('POST');
      expect(http.url).toBe('/api/v1/sessions/s1/messages');
      expect(http.status).toBe(200);
      expect(http.responseTimeMs).toBe(12.4);
      expect(http.remoteAddress).toBe('127.0.0.1');
      expect(http.userAgent).toBe('kimi-inspect/0.0.0');
      expect(http.requestId).toBe('req-1');
      expect(http.sessionId).toBe('s1');
    }
    const llm = entries[1];
    expect(llm?.kind).toBe('llm');
    if (llm?.kind === 'llm') {
      expect(llm.model).toBe('carcara/deepseek');
      expect(llm.inputTokens).toBe(120);
      expect(llm.outputTokens).toBe(40);
      expect(llm.source).toBe('chat');
      expect(llm.sessionId).toBe('s1');
    }
  });

  it('omits the authorization header and query params when nothing is configured', async () => {
    const { calls, fetchImpl } = fakeFetch(okEnvelope(journalData));
    await fetchRequests({ baseUrl: 'http://h:1', fetchImpl });
    expect(calls[0]!.url).toBe('http://h:1/api/v1/debug/requests');
    expect(calls[0]!.init?.headers).toEqual({});
  });

  it('leaves absent optional fields undefined', async () => {
    const { fetchImpl } = fakeFetch(
      okEnvelope([
        { kind: 'http', ts: 1, method: 'GET', url: '/x', responseTimeMs: 1, requestId: 'r' },
        { kind: 'llm', ts: 2, model: 'm', inputTokens: 0, outputTokens: 0 },
      ]),
    );
    const entries = await fetchRequests({ baseUrl: 'http://h:1', fetchImpl });
    const http = entries[0];
    if (http?.kind === 'http') {
      expect(http.status).toBeUndefined();
      expect(http.remoteAddress).toBeUndefined();
      expect(http.sessionId).toBeUndefined();
    }
    const llm = entries[1];
    if (llm?.kind === 'llm') {
      expect(llm.sessionId).toBeUndefined();
      expect(llm.source).toBeUndefined();
    }
  });

  it('throws on a non-zero envelope code', async () => {
    const { fetchImpl } = fakeFetch({ code: 40001, msg: 'boom', data: null });
    await expect(fetchRequests({ baseUrl: 'http://h:1', fetchImpl })).rejects.toThrow(/40001/);
  });

  it('throws on a non-array payload', async () => {
    const { fetchImpl } = fakeFetch(okEnvelope({ items: [] }));
    await expect(fetchRequests({ baseUrl: 'http://h:1', fetchImpl })).rejects.toThrow(
      /unexpected response shape/,
    );
  });
});
