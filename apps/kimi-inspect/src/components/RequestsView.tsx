/**
 * Requests view — the live request journal (`GET /api/v1/debug/requests`):
 * a table of the most recent HTTP and LLM requests across every session,
 * grouped by nothing but time (newest last). Two filters — kind and a
 * session-id substring — plus a pause switch to freeze the poll while
 * inspecting a row. The journal only exists while kap-server runs with
 * `--debug-endpoints`.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useConnection } from '../connection';
import { fetchRequests, type RequestJournalEntry } from '../requests/api';
import { Badge, ErrorLine, relTime } from '../ui';

const POLL_INTERVAL_MS = 3000;
const LIMIT = 500;

type KindFilter = 'all' | 'http' | 'llm';

export function RequestsView() {
  const { baseUrl, config } = useConnection();
  const [kind, setKind] = useState<KindFilter>('all');
  const [sessionFilter, setSessionFilter] = useState('');
  const [paused, setPaused] = useState(false);

  const token = config.token.trim();
  const sessionId = sessionFilter.trim();
  const query = useQuery({
    queryKey: ['requests', kind, sessionId],
    queryFn: () =>
      fetchRequests({
        baseUrl,
        token: token === '' ? undefined : token,
        kind: kind === 'all' ? undefined : kind,
        sessionId: sessionId === '' ? undefined : sessionId,
        limit: LIMIT,
      }),
    refetchInterval: paused ? undefined : POLL_INTERVAL_MS,
  });

  const entries = query.data ?? [];

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
        <select
          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-300 outline-none"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as KindFilter);
          }}
          title="Entry kind"
        >
          <option value="all">http + llm</option>
          <option value="http">http</option>
          <option value="llm">llm</option>
        </select>
        <input
          className="w-56 rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-sky-600"
          placeholder="filter by session id…"
          value={sessionFilter}
          onChange={(e) => {
            setSessionFilter(e.target.value);
          }}
        />
        <label
          className="flex cursor-pointer items-center gap-1.5 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-300 select-none"
          title="Freeze the 3s poll while inspecting a row"
        >
          <input
            type="checkbox"
            className="accent-sky-600"
            checked={paused}
            onChange={(e) => {
              setPaused(e.target.checked);
            }}
          />
          paused
        </label>
        <span className="ml-2 text-[11px] text-neutral-600">
          {entries.length === 0 ? 'no requests' : `${entries.length} entries`}
        </span>
        {query.isFetching ? (
          <span className="ml-auto animate-pulse text-[10px] uppercase text-sky-500">live</span>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {query.isError ? <ErrorLine error={query.error} /> : null}
        {entries.length === 0 && !query.isError ? (
          <div className="text-[12px] text-neutral-600 italic">
            No requests yet. Send a prompt or hit any endpoint while kap-server runs with{' '}
            <code className="text-neutral-500">--debug-endpoints</code>.
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wide text-neutral-600">
                <th className="px-2 py-1.5 font-medium">time</th>
                <th className="px-2 py-1.5 font-medium">kind</th>
                <th className="px-2 py-1.5 font-medium">target</th>
                <th className="px-2 py-1.5 font-medium">session</th>
                <th className="px-2 py-1.5 font-medium">peer</th>
                <th className="px-2 py-1.5 font-medium">status</th>
                <th className="px-2 py-1.5 font-medium">tokens</th>
                <th className="px-2 py-1.5 font-medium">ms</th>
              </tr>
            </thead>
            <tbody className="text-[12px] text-neutral-300">
              {entries.map((entry, i) => (
                <EntryRow key={entry.ts + i} entry={entry} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EntryRow({ entry }: { entry: RequestJournalEntry }) {
  const ts = new Date(entry.ts);
  if (entry.kind === 'http') {
    return (
      <tr className="border-b border-neutral-800/50 align-top hover:bg-neutral-900/40">
        <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-neutral-500" title={ts.toLocaleString()}>
          {relTime(entry.ts)}
        </td>
        <td className="px-2 py-1.5">
          <Badge tone="sky">http</Badge>
        </td>
        <td className="max-w-[32rem] truncate px-2 py-1.5">
          <span className="font-mono text-[11px] text-neutral-500">{entry.method}</span>{' '}
          <span className="font-mono text-neutral-200" title={entry.url}>
            {entry.url}
          </span>
        </td>
        <td className="px-2 py-1.5">
          <SessionCell sessionId={entry.sessionId} />
        </td>
        <td className="max-w-[16rem] truncate px-2 py-1.5 font-mono text-[11px] text-neutral-500" title={entry.userAgent}>
          {entry.remoteAddress ?? ''}
          {entry.remoteAddress !== undefined && entry.userAgent !== undefined ? ' · ' : ''}
          {entry.userAgent ?? ''}
        </td>
        <td className="px-2 py-1.5">
          <StatusCell status={entry.status} />
        </td>
        <td className="px-2 py-1.5 text-neutral-600">—</td>
        <td className="px-2 py-1.5 whitespace-nowrap text-right font-mono text-[11px] text-neutral-500">
          {entry.responseTimeMs}ms
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-neutral-800/50 align-top hover:bg-neutral-900/40">
      <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-neutral-500" title={ts.toLocaleString()}>
        {relTime(entry.ts)}
      </td>
      <td className="px-2 py-1.5">
        <Badge tone="violet">llm</Badge>
      </td>
      <td className="max-w-[32rem] truncate px-2 py-1.5">
        <span className="font-mono text-neutral-200" title={entry.source}>
          {entry.model}
        </span>
        {entry.source !== undefined ? (
          <span className="ml-2 text-[10px] text-neutral-600">{entry.source}</span>
        ) : null}
      </td>
      <td className="px-2 py-1.5">
        <SessionCell sessionId={entry.sessionId} />
      </td>
      <td className="px-2 py-1.5 text-neutral-600">—</td>
      <td className="px-2 py-1.5 text-neutral-600">—</td>
      <td className="px-2 py-1.5 whitespace-nowrap font-mono text-[11px]">
        <span className="text-neutral-400">{entry.inputTokens.toLocaleString()}</span>
        <span className="text-neutral-600"> → </span>
        <span className="text-neutral-400">{entry.outputTokens.toLocaleString()}</span>
      </td>
      <td className="px-2 py-1.5 text-neutral-600">—</td>
    </tr>
  );
}

function SessionCell({ sessionId }: { sessionId: string | undefined }) {
  if (sessionId === undefined || sessionId === '') {
    return <span className="font-mono text-[11px] text-neutral-600">—</span>;
  }
  return (
    <span className="font-mono text-[11px] text-neutral-400" title={sessionId}>
      {sessionId.slice(0, 12)}
    </span>
  );
}

function StatusCell({ status }: { status: number | undefined }) {
  if (status === undefined) return <span className="text-neutral-600">—</span>;
  const tone =
    status >= 200 && status < 300
      ? ('green' as const)
      : status >= 400
        ? ('red' as const)
        : ('amber' as const);
  return <Badge tone={tone}>{status}</Badge>;
}
