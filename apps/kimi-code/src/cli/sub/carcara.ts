import { createInterface } from 'node:readline/promises';

import { createKimiHarness, type KimiConfig, type KimiHarness } from '@moonshot-ai/kimi-code-sdk';
import type { Command } from 'commander';

import { createKimiCodeHostIdentity } from '#/cli/host-identity';

interface WritableLike {
  write(chunk: string): boolean;
}

export interface CarcaraDeps {
  readonly getHarness: () => KimiHarness;
  readonly stdout: WritableLike;
  readonly stderr: WritableLike;
  readonly env: NodeJS.ProcessEnv;
  readonly exit: (code: number) => never;
}

interface CarcaraLoginOptions {
  readonly user?: string;
  readonly password?: string;
  readonly domain?: string;
  readonly baseUrl?: string;
}

interface CarcaraLogoutOptions {
  readonly baseUrl?: string;
}

const CARCARA_DEFAULT_BASE_URL = 'https://carcara.sinapad.lncc.br/service/v1';

export async function handleCarcaraLogin(
  deps: CarcaraDeps,
  opts: CarcaraLoginOptions,
): Promise<void> {
  const user = opts.user ?? deps.env['CARCARA_USER'];
  const baseUrl = opts.baseUrl ?? deps.env['CARCARA_BASE_URL'] ?? CARCARA_DEFAULT_BASE_URL;
  const domain = opts.domain ?? 'LNCC';

  if (user === undefined || user.trim().length === 0) {
    deps.stderr.write('Missing Carcará username. Pass --user <name> or set CARCARA_USER.\n');
    deps.exit(1);
  }

  const password = opts.password ?? (await askPassword(deps, `Carcará password for ${user}: `));
  if (password === undefined || password.length === 0) {
    deps.stderr.write('Carcará password is required.\n');
    deps.exit(1);
  }

  let session;
  try {
    const { loginCarcara } = await import('@moonshot-ai/agent-core-v2/llm-adapter/carcara/session');
    session = await loginCarcara(baseUrl, user.trim(), password, domain);
  } catch (error) {
    deps.stderr.write(`${errorMessage(error)}\n`);
    deps.exit(1);
  }

  const harness = deps.getHarness();
  await harness.ensureConfigFile();
  const config = await harness.getConfig();

  const carcaraModule = await import('@moonshot-ai/agent-core-v2/llm-adapter/carcara/session');
  const origin = carcaraModule.carcaraOrigin(session.baseUrl);
  const carcaraProvider: KimiConfig['providers'][string] = {
    type: 'carcara',
    baseUrl: session.baseUrl,
    customHeaders: {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
      Referer: `${origin}/service/`,
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      Origin: origin,
      Cookie: `PHPSESSID=${session.phpsessid}`,
    },
  };
  const providers = {
    ...config.providers,
    carcara: carcaraProvider,
  };
  const models = {
    ...config.models,
    'carcara/deepseek': {
      provider: 'carcara',
      model: 'DeepSeek-v4-Flash-0731',
      maxContextSize: 131072,
      capabilities: ['thinking'],
    },
    'carcara/qwen': {
      provider: 'carcara',
      model: 'Qwen3.8-27B',
      maxContextSize: 32768,
    },
  };

  await harness.setConfig({
    providers,
    models,
    ...(config.defaultModel === undefined ? { defaultModel: 'carcara/deepseek' } : {}),
  });

  carcaraModule.saveCarcaraSession(session);

  deps.stdout.write(`Logged in to Carcará (${session.baseUrl}) as ${session.user}.\n`);
  deps.stdout.write(
    config.defaultModel === undefined
      ? 'Set default model to carcara/deepseek.\n'
      : 'Provider "carcara" configured. Set default_model in config.toml to use it.\n',
  );
}

export async function handleCarcaraLogout(
  deps: CarcaraDeps,
  opts: CarcaraLogoutOptions,
): Promise<void> {
  const { deleteCarcaraSession } = await import('@moonshot-ai/agent-core-v2/llm-adapter/carcara/session');
  const removed = deleteCarcaraSession(opts.baseUrl);
  if (removed) {
    deps.stdout.write('OK Carcará session removed.\n');
  } else {
    deps.stdout.write('No Carcará session found.\n');
  }
}

export function registerCarcaraCommand(parent: Command, deps?: Partial<CarcaraDeps>): void {
  parent
    .command('carcara-login')
    .description('Authenticate with the Carcará (Sinapad/LNCC) endpoint and store the session.')
    .option('--user <name>', 'Carcará username. Falls back to CARCARA_USER.')
    .option('--password <password>', 'Carcará password (interactive prompt when omitted).')
    .option('--domain <domain>', 'Carcará login domain. Defaults to LNCC.')
    .option(
      '--base-url <url>',
      `Carcará base URL. Defaults to ${CARCARA_DEFAULT_BASE_URL}.`,
    )
    .action(async (options: CarcaraLoginOptions) => {
      const resolved = resolveDeps(deps);
      try {
        await handleCarcaraLogin(resolved, options);
      } catch (error) {
        resolved.stderr.write(`${errorMessage(error)}\n`);
        resolved.exit(1);
      } finally {
        await resolved.close();
      }
    });

  parent
    .command('carcara-logout')
    .description('Remove the saved Carcará session.')
    .option(
      '--base-url <url>',
      `Carcará base URL. Defaults to ${CARCARA_DEFAULT_BASE_URL}.`,
    )
    .action(async (options: CarcaraLogoutOptions) => {
      const resolved = resolveDeps(deps);
      try {
        await handleCarcaraLogout(resolved, options);
      } catch (error) {
        resolved.stderr.write(`${errorMessage(error)}\n`);
        resolved.exit(1);
      } finally {
        await resolved.close();
      }
    });
}

type ResolvedCarcaraDeps = CarcaraDeps & { readonly close: () => Promise<void> };

function resolveDeps(overrides: Partial<CarcaraDeps> = {}): ResolvedCarcaraDeps {
  let harness: KimiHarness | undefined;
  const identity = createKimiCodeHostIdentity();
  return {
    getHarness:
      overrides.getHarness ??
      (() => {
        harness ??= createKimiHarness({ identity });
        return harness;
      }),
    stdout: overrides.stdout ?? process.stdout,
    stderr: overrides.stderr ?? process.stderr,
    env: overrides.env ?? process.env,
    exit: overrides.exit ?? ((code: number) => process.exit(code)),
    close: async () => {
      await harness?.close();
    },
  };
}

async function askPassword(deps: CarcaraDeps, prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
