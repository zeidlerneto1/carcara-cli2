import type { FastifyInstance, FastifyReply } from 'fastify';

import type { RequestJournal } from './services/requestJournal';

export function extractEnvelopeCode(payload: unknown): number | undefined {
  if (typeof payload !== 'string') {
    return undefined;
  }
  const match = /^\s*\{\s*"code"\s*:\s*(-?\d+)/.exec(payload);
  if (match === null) {
    return undefined;
  }
  const code = Number(match[1]);
  return Number.isSafeInteger(code) ? code : undefined;
}

const SESSION_ID_PATH_RE = /\/api\/v\d+\/sessions\/([^/?#]+)/;

export function extractSessionIdFromUrl(rawUrl: string): string | undefined {
  let path = rawUrl.split('?', 1)[0] ?? rawUrl;
  try {
    path = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  const match = SESSION_ID_PATH_RE.exec(path);
  return match === null ? undefined : match[1];
}

export interface RequestLoggingOptions {
  readonly journal?: RequestJournal;
}

export function registerRequestLogging(
  app: FastifyInstance,
  opts: RequestLoggingOptions = {},
): void {
  const codes = new WeakMap<FastifyReply, number>();

  app.addHook('onSend', (req, reply, payload, done) => {
    const code = extractEnvelopeCode(payload);
    if (code !== undefined) {
      codes.set(reply, code);
    }
    done(null, payload);
  });

  app.addHook('onResponse', (req, reply, done) => {
    const code = codes.get(reply);
    req.log.info(
      {
        req: {
          method: req.method,
          url: req.url,
          version: req.headers['accept-version'],
          host: req.host,
          remoteAddress: req.ip,
          remotePort: req.socket === undefined ? undefined : req.socket.remotePort,
        },
        code,
        responseTime: reply.elapsedTime,
      },
      'request completed',
    );
    opts.journal?.append({
      kind: 'http',
      ts: Date.now(),
      method: req.method,
      url: req.url,
      status: code,
      responseTimeMs: reply.elapsedTime,
      remoteAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
      sessionId: extractSessionIdFromUrl(req.url),
    });
    done();
  });
}
