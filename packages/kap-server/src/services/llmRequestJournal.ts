import {
  inputTotal,
  ISessionManager,
  ISessionUsageService,
  type IDisposable,
  type ISessionScopeHandle,
  type Scope,
} from '@moonshot-ai/agent-core-v2';

import type { RequestJournal } from './requestJournal';

const SYNC_INTERVAL_MS = 1000;

function sourceName(source: { readonly type: string } | undefined): string | undefined {
  if (source?.type === 'operation') {
    const requestKind = (source as { readonly requestKind?: string }).requestKind;
    return requestKind === undefined ? 'operation' : requestKind;
  }
  return source?.type;
}

export class LlmRequestJournalReconciler {
  private readonly synced = new Set<string>();
  private readonly subscriptions = new Map<string, IDisposable>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly core: Scope,
    private readonly journal: RequestJournal,
    private readonly intervalMs = SYNC_INTERVAL_MS,
  ) {}

  start(): void {
    this.sync();
    this.timer = setInterval(() => this.sync(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const subscription of this.subscriptions.values()) {
      subscription.dispose();
    }
    this.subscriptions.clear();
    this.synced.clear();
  }

  private sync(): void {
    let live: readonly ISessionScopeHandle[];
    try {
      live = this.core.accessor.get(ISessionManager).list();
    } catch {
      return;
    }
    const liveIds = new Set(live.map((handle) => handle.id));
    for (const id of this.subscriptions.keys()) {
      if (!liveIds.has(id)) {
        this.subscriptions.get(id)?.dispose();
        this.subscriptions.delete(id);
        this.synced.delete(id);
      }
    }
    for (const handle of live) {
      if (this.synced.has(handle.id)) continue;
      this.synced.add(handle.id);
      this.subscriptions.set(handle.id, this.subscribe(handle));
    }
  }

  private subscribe(handle: ISessionScopeHandle): IDisposable {
    let service: ISessionUsageService;
    try {
      service = handle.accessor.get(ISessionUsageService);
    } catch {
      return { dispose: () => {} };
    }
    const sessionId = handle.id;
    return service.onDidRecord(({ model, usage, source }) => {
      this.journal.append({
        kind: 'llm',
        ts: Date.now(),
        sessionId,
        model,
        inputTokens: inputTotal(usage),
        outputTokens: usage.output,
        source: sourceName(source),
      });
    });
  }
}
