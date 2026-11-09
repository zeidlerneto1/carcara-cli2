export interface HttpRequestJournalEntry {
  readonly kind: 'http';
  readonly ts: number;
  readonly method: string;
  readonly url: string;
  readonly status?: number;
  readonly responseTimeMs: number;
  readonly remoteAddress?: string;
  readonly userAgent?: string;
  readonly requestId: string;
  readonly sessionId?: string;
}

export interface LlmRequestJournalEntry {
  readonly kind: 'llm';
  readonly ts: number;
  readonly sessionId?: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly source?: string;
}

export type RequestJournalEntry = HttpRequestJournalEntry | LlmRequestJournalEntry;

export interface RequestJournalFilter {
  readonly sessionId?: string;
  readonly kind?: 'http' | 'llm';
  readonly limit?: number;
}

const DEFAULT_CAPACITY = 2000;

export class RequestJournal {
  private readonly entries: RequestJournalEntry[] = [];
  private readonly capacity: number;

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
  }

  append(entry: RequestJournalEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      const overflow = this.entries.length - this.capacity;
      this.entries.splice(0, overflow);
    }
  }

  snapshot(filter: RequestJournalFilter = {}): readonly RequestJournalEntry[] {
    let result = this.entries;
    if (filter.sessionId !== undefined) {
      result = result.filter((entry) => entry.sessionId === filter.sessionId);
    }
    if (filter.kind !== undefined) {
      result = result.filter((entry) => entry.kind === filter.kind);
    }
    const limit = filter.limit ?? result.length;
    const clamped = Math.max(0, Math.min(limit, result.length));
    return result.slice(Math.max(0, result.length - clamped));
  }

  clear(): void {
    this.entries.length = 0;
  }

  size(): number {
    return this.entries.length;
  }
}
