import { okEnvelope } from '../protocol/envelope';
import type { RequestJournal } from '../services/requestJournal';
import type { RouteHost } from './serviceDispatcherRoutes';

export function registerRequestJournalRoutes(
  app: RouteHost,
  journal: RequestJournal,
  basePath: string,
): void {
  app.get(`${basePath}/requests`, async (req, reply) =>
    reply.send(
      okEnvelope(
        journal.snapshot({
          sessionId: queryString(req.query, 'session_id'),
          kind: queryKind(req.query),
          limit: queryNumber(req.query, 'limit'),
        }),
        req.id,
      ),
    ),
  );
}

function queryMap(query: unknown): Record<string, unknown> {
  return (query as Record<string, unknown> | undefined) ?? {};
}

function queryString(query: unknown, key: string): string | undefined {
  const value = queryMap(query)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function queryKind(query: unknown): 'http' | 'llm' | undefined {
  const value = queryMap(query)['kind'];
  return value === 'http' || value === 'llm' ? value : undefined;
}

function queryNumber(query: unknown, key: string): number | undefined {
  const value = queryMap(query)[key];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return undefined;
}
