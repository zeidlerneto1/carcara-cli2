/**
 * REST client for the request journal endpoint:
 * `GET {baseUrl}/api/v1/debug/requests`.
 *
 * The endpoint (mounted only when kap-server runs with `--debug-endpoints`)
 * returns a ring-buffer snapshot of the most recent HTTP and LLM requests,
 * newest last. The wire shape is validated locally by hand (this app does not
 * depend on zod): a malformed envelope throws, individual entries with an
 * unexpected shape are dropped rather than failing the whole page.
 */

export interface HttpRequestJournalEntry {
  readonly kind: 'http';
  readonly ts: number;
  readonly method: string;
  readonly url: string;
  readonly status?: number | undefined;
  readonly responseTimeMs: number;
  readonly remoteAddress?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly requestId: string;
  readonly sessionId?: string | undefined;
}

export interface LlmRequestJournalEntry {
  readonly kind: 'llm';
  readonly ts: number;
  readonly sessionId?: string | undefined;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly source?: string | undefined;
}

export type RequestJournalEntry = HttpRequestJournalEntry | LlmRequestJournalEntry;

export interface FetchRequestsOptions {
  readonly baseUrl: string;
  readonly token?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly kind?: 'http' | 'llm' | undefined;
  readonly limit?: number | undefined;
  /** Injectable for tests. */
  readonly fetchImpl?: typeof fetch;
}

function parseHttpEntry(value: Record<string, unknown>): HttpRequestJournalEntry | undefined {
  if (
    typeof value['ts'] !== 'number' ||
    typeof value['method'] !== 'string' ||
    typeof value['url'] !== 'string' ||
    typeof value['responseTimeMs'] !== 'number' ||
    typeof value['requestId'] !== 'string'
  ) {
    return undefined;
  }
  return {
    kind: 'http',
    ts: value['ts'],
    method: value['method'],
    url: value['url'],
    status: typeof value['status'] === 'number' ? value['status'] : undefined,
    responseTimeMs: value['responseTimeMs'],
    remoteAddress: typeof value['remoteAddress'] === 'string' ? value['remoteAddress'] : undefined,
    userAgent: typeof value['userAgent'] === 'string' ? value['userAgent'] : undefined,
    requestId: value['requestId'],
    sessionId: typeof value['sessionId'] === 'string' ? value['sessionId'] : undefined,
  };
}

function parseLlmEntry(value: Record<string, unknown>): LlmRequestJournalEntry | undefined {
  if (
    typeof value['ts'] !== 'number' ||
    typeof value['model'] !== 'string' ||
    typeof value['inputTokens'] !== 'number' ||
    typeof value['outputTokens'] !== 'number'
  ) {
    return undefined;
  }
  return {
    kind: 'llm',
    ts: value['ts'],
    sessionId: typeof value['sessionId'] === 'string' ? value['sessionId'] : undefined,
    model: value['model'],
    inputTokens: value['inputTokens'],
    outputTokens: value['outputTokens'],
    source: typeof value['source'] === 'string' ? value['source'] : undefined,
  };
}

function parseEntry(value: unknown): RequestJournalEntry | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (v['kind'] === 'http') return parseHttpEntry(v);
  if (v['kind'] === 'llm') return parseLlmEntry(v);
  return undefined;
}

export async function fetchRequests(
  opts: FetchRequestsOptions,
): Promise<readonly RequestJournalEntry[]> {
  const params = new URLSearchParams();
  if (opts.sessionId !== undefined && opts.sessionId !== '') {
    params.set('session_id', opts.sessionId);
  }
  if (opts.kind !== undefined) {
    params.set('kind', opts.kind);
  }
  if (opts.limit !== undefined) {
    params.set('limit', String(opts.limit));
  }
  const qs = params.toString();
  const headers: Record<string, string> = {};
  if (opts.token !== undefined && opts.token !== '') {
    headers['authorization'] = `Bearer ${opts.token}`;
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(
    `${opts.baseUrl}/api/v1/debug/requests${qs === '' ? '' : `?${qs}`}`,
    { method: 'GET', headers },
  );
  const envelope = (await res.json()) as { code: number; msg: string; data: unknown };
  if (envelope.code !== 0) {
    throw new Error(`requests failed (${envelope.code}): ${envelope.msg}`);
  }
  if (!Array.isArray(envelope.data)) {
    throw new TypeError('requests: unexpected response shape');
  }
  return envelope.data.map(parseEntry).filter((e): e is RequestJournalEntry => e !== undefined);
}
