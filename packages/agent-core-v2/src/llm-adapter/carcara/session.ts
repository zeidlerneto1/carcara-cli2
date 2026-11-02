import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

import { resolveKimiHome } from '#/app/bootstrap/bootstrap';

export const CARCARA_DEFAULT_BASE_URL = 'https://carcara.sinapad.lncc.br/service/v1';
export const CARCARA_DEFAULT_DOMAIN = 'LNCC';
export const CARCARA_LOGIN_PATH = '/apps/login/action/loginAction.php';

export const CARCARA_BROWSER_HEADERS: Readonly<Record<string, string>> = {
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
  Referer: 'https://carcara.sinapad.lncc.br/service/',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  Origin: 'https://carcara.sinapad.lncc.br',
};

export interface CarcaraSession {
  readonly baseUrl: string;
  readonly user: string;
  readonly domain: string;
  readonly phpsessid: string;
}

export class CarcaraLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarcaraLoginError';
  }
}

export function carcaraOrigin(baseUrl: string): string {
  const url = baseUrl.replace(/\/+$/, '');
  const scheme = url.split('://')[0];
  const rest = url.split('://')[1] ?? '';
  const host = rest.split('/')[0] ?? '';
  return `${scheme}://${host}`;
}

export function carcaraCredentialsDir(homeDir?: string): string {
  return join(resolveKimiHome(homeDir), 'credentials');
}

export function carcaraSessionFileName(baseUrl: string): string {
  const host =
    baseUrl.replace(/\/+$/, '').split('://')[1]?.split('/')[0]?.replaceAll(':', '_') ?? 'carcara';
  return `carcara-${host}.json`;
}

export function loadCarcaraSession(baseUrl?: string, homeDir?: string): CarcaraSession | undefined {
  const dir = carcaraCredentialsDir(homeDir);
  if (baseUrl !== undefined) {
    return loadCarcaraSessionFile(join(dir, carcaraSessionFileName(baseUrl)));
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }
  const candidates = entries
    .filter((entry) => entry.startsWith('carcara-') && entry.endsWith('.json'))
    .toSorted();
  for (const name of candidates) {
    const session = loadCarcaraSessionFile(join(dir, name));
    if (session !== undefined) return session;
  }
  return undefined;
}

function loadCarcaraSessionFile(path: string): CarcaraSession | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  return parseSession(parsed);
}

export function saveCarcaraSession(session: CarcaraSession, homeDir?: string): void {
  const dir = carcaraCredentialsDir(homeDir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // best-effort
  }
  const target = join(dir, carcaraSessionFileName(session.baseUrl));
  const tmp = `${target}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`;
  const data = Buffer.from(`${JSON.stringify(session, null, 2)}\n`, 'utf-8');
  const fd = openSync(tmp, 'w', 0o600);
  try {
    let written = 0;
    while (written < data.length) {
      written += writeSync(fd, data, written, data.length - written);
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    chmodSync(tmp, 0o600);
    renameSync(tmp, target);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw error;
  }
}

export function deleteCarcaraSession(baseUrl?: string, homeDir?: string): boolean {
  const dir = carcaraCredentialsDir(homeDir);
  if (baseUrl !== undefined) {
    const path = join(dir, carcaraSessionFileName(baseUrl));
    try {
      unlinkSync(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return false;
    }
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  let removed = false;
  for (const name of entries.filter(
    (entry) => entry.startsWith('carcara-') && entry.endsWith('.json'),
  )) {
    try {
      unlinkSync(join(dir, name));
      removed = true;
    } catch {
      // continue removing the rest
    }
  }
  return removed;
}

export async function loginCarcara(
  baseUrl: string,
  user: string,
  password: string,
  domain: string = CARCARA_DEFAULT_DOMAIN,
): Promise<CarcaraSession> {
  const normalized = baseUrl.replace(/\/+$/, '');
  const origin = carcaraOrigin(normalized);
  const loginUrl = `${origin}${CARCARA_LOGIN_PATH}`;
  const payload = { action: 'login', user, password, domain };

  let response: Response;
  try {
    response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        ...CARCARA_BROWSER_HEADERS,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.7',
        'Content-Type': 'application/json;charset=UTF-8',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        Referer: `${origin}/`,
        Origin: origin,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new CarcaraLoginError(`Carcará login request failed: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    throw new CarcaraLoginError(
      `Carcará login failed with HTTP ${response.status}: ${(await safeText(response)).slice(0, 200)}`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new CarcaraLoginError('Carcará login returned a non-JSON response');
  }

  if (!isRecord(raw) || String(raw['status'] ?? '').toLowerCase() !== 'ok') {
    throw new CarcaraLoginError(`Carcará login rejected: ${JSON.stringify(raw)}`);
  }

  const phpsessid = extractPhpsessid(response.headers);
  if (phpsessid === undefined) {
    throw new CarcaraLoginError('Carcará login did not return a PHPSESSID session cookie');
  }

  const session: CarcaraSession = { baseUrl: normalized, user, domain, phpsessid };
  await validateCarcaraSession(session);
  return session;
}

export async function validateCarcaraSession(session: CarcaraSession): Promise<void> {
  const url = `${session.baseUrl.replace(/\/+$/, '')}/models`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        ...CARCARA_BROWSER_HEADERS,
        'Content-Type': 'application/json',
        Cookie: `PHPSESSID=${session.phpsessid}`,
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new CarcaraLoginError(`Carcará session validation failed: ${errorMessage(error)}`);
  }
  if (!response.ok) {
    throw new CarcaraLoginError(`Carcará session validation failed with HTTP ${response.status}`);
  }
}

function extractPhpsessid(headers: Headers): string | undefined {
  const cookie = headers.get('set-cookie');
  if (cookie === null || cookie === undefined || cookie.length === 0) return undefined;
  const match = /(?:^|;\s*)PHPSESSID=([^;]+)/i.exec(cookie);
  return match?.[1];
}

function parseSession(value: Record<string, unknown>): CarcaraSession | undefined {
  const baseUrl = stringField(value, 'baseUrl');
  const user = stringField(value, 'user');
  const domain = stringField(value, 'domain');
  const phpsessid = stringField(value, 'phpsessid');
  if (baseUrl === undefined || user === undefined || domain === undefined || phpsessid === undefined) {
    return undefined;
  }
  return { baseUrl, user, domain, phpsessid };
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
