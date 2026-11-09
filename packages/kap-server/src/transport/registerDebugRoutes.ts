import type { Scope } from '@moonshot-ai/agent-core-v2';

import type { RequestJournal } from '../services/requestJournal';
import { registerBusinessSnapshotRoutes } from './businessSnapshotRoutes';
import { describeAllChannels, resolveAnyScopedServiceId } from './channelRegistry';
import { registerRequestJournalRoutes } from './requestJournalRoutes';
import { type RouteHost, registerServiceDispatcherRoutes } from './serviceDispatcherRoutes';

export interface RegisterDebugRoutesOptions {
  readonly requestJournal?: RequestJournal;
}

export function registerDebugRoutes(
  app: RouteHost,
  core: Scope,
  opts: RegisterDebugRoutesOptions = {},
): void {
  registerServiceDispatcherRoutes(app, core, '/debug', {
    lookup: (name) => resolveAnyScopedServiceId(core, name),
    describe: describeAllChannels,
  });
  registerBusinessSnapshotRoutes(app, core, '/debug');
  if (opts.requestJournal !== undefined) {
    registerRequestJournalRoutes(app, opts.requestJournal, '/debug');
  }
}
