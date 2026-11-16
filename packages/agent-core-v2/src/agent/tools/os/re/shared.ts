import type { Readable } from 'node:stream';

import type { IHostProcess, IHostProcessService } from '#/os/interface/hostProcess';

export const RE_DEFAULT_TIMEOUT_MS = 30_000;
export const RE_SIGTERM_GRACE_MS = 5_000;
export const RE_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export interface RunCommandResult {
  readonly exitCode: number;
  readonly output: string;
  readonly timedOut: boolean;
}

export interface RunCommandOptions {
  readonly timeoutMs?: number;
  readonly cwd?: string;
  readonly stdin?: string;
  readonly env?: Record<string, string>;
}

export async function runCommand(
  processService: IHostProcessService,
  command: string,
  args: readonly string[] = [],
  options: RunCommandOptions = {},
): Promise<RunCommandResult> {
  const proc: IHostProcess = await processService.spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
  });
  try {
    if (options.stdin !== undefined) proc.stdin.write(options.stdin);
    proc.stdin.end();
  } catch {
  }

  let timedOut = false;
  let killed = false;
  const killProc = (): void => {
    if (killed) return;
    killed = true;
    try {
      void proc.kill('SIGTERM');
    } catch {
    }
    setTimeout(() => {
      if (proc.exitCode === null) {
        try {
          void proc.kill('SIGKILL');
        } catch {
        }
      }
    }, RE_SIGTERM_GRACE_MS);
  };

  const timeoutMs = options.timeoutMs ?? RE_DEFAULT_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    killProc();
  }, timeoutMs);

  let exitCode = 0;
  let output = '';
  try {
    const [stdoutText, stderrText, code] = await Promise.all([
      readStreamWithCap(proc.stdout, RE_MAX_OUTPUT_BYTES, timedOut),
      readStreamWithCap(proc.stderr, RE_MAX_OUTPUT_BYTES, timedOut),
      proc.wait(),
    ]);
    exitCode = code;
    output = stdoutText + stderrText;
  } catch {
    if (exitCode === 0 && proc.exitCode !== null) exitCode = proc.exitCode;
  } finally {
    clearTimeout(timeoutHandle);
    try {
      void proc.dispose();
    } catch {
    }
  }

  return { exitCode, output, timedOut };
}

async function readStreamWithCap(
  stream: Readable,
  maxBytes: number,
  suppressPrematureClose: boolean,
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  try {
    for await (const chunk of stream) {
      const buf: Buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : (chunk as Buffer);
      if (truncated) continue;
      if (total + buf.length > maxBytes) {
        const remaining = maxBytes - total;
        if (remaining > 0) chunks.push(buf.subarray(0, remaining));
        total = maxBytes;
        truncated = true;
        continue;
      }
      chunks.push(buf);
      total += buf.length;
    }
  } catch (error) {
    if (
      !(
        suppressPrematureClose &&
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ERR_STREAM_PREMATURE_CLOSE'
      )
    ) {
      throw error;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

export type ReArch = 'x86' | 'mips' | 'arm' | 'x86_64';

const ELF_EM_MACHINE: ReadonlyMap<number, ReArch> = new Map<number, ReArch>([
  [3, 'x86'],
  [8, 'mips'],
  [40, 'arm'],
  [62, 'x86_64'],
]);

const PE_MACHINE: ReadonlyMap<number, ReArch> = new Map<number, ReArch>([
  [0x14c, 'x86'],
  [0x8664, 'x86_64'],
  [0x1c0, 'arm'],
  [0xaa64, 'arm'],
]);

export function detectFormat(header: Buffer): 'elf' | 'pe' | null {
  if (header.length >= 4 && header[0] === 0x7f && header.subarray(1, 4).toString('ascii') === 'ELF') {
    return 'elf';
  }
  if (header.length >= 2 && header.subarray(0, 2).toString('ascii') === 'MZ') {
    return 'pe';
  }
  return null;
}

export function detectElf(header: Buffer): { arch: ReArch | null; endian: 'big' | 'little' | null } {
  if (header.length < 20) return { arch: null, endian: null };
  let endian: 'big' | 'little' | null = null;
  if (header[5] === 1) endian = 'little';
  else if (header[5] === 2) endian = 'big';
  if (endian === null) return { arch: null, endian: null };
  const machine = endian === 'little' ? header.readUInt16LE(18) : header.readUInt16BE(18);
  return { arch: ELF_EM_MACHINE.get(machine) ?? null, endian };
}

export function detectPe(data: Buffer, header: Buffer): { arch: ReArch | null; endian: 'little' } {
  if (header.length < 0x40 || data.length < 0x40) return { arch: null, endian: 'little' };
  const peOff = header.readUInt32LE(0x3c);
  const coff = data.subarray(peOff + 4, peOff + 6);
  if (coff.length < 2) return { arch: null, endian: 'little' };
  const machine = coff.readUInt16LE(0);
  return { arch: PE_MACHINE.get(machine) ?? null, endian: 'little' };
}

export interface TextSection {
  readonly addr: number;
  readonly off: number;
  readonly size: number;
}

export async function resolveTextSection(
  processService: IHostProcessService,
  target: string,
  fmt: 'elf' | 'pe',
): Promise<TextSection | null> {
  if (fmt === 'elf') return elfTextSection(processService, target);
  return peTextSection(processService, target);
}

async function elfTextSection(
  processService: IHostProcessService,
  target: string,
): Promise<TextSection | null> {
  const result = await runCommand(processService, 'readelf', ['-S', target]);
  if (result.exitCode !== 0) return null;
  const lines = result.output.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const parts = line.trim().split(/\s+/);
    const idx = parts.indexOf('.text');
    if (idx === -1) continue;
    const addr = parseInt(parts[idx + 2]!, 16);
    const off = parseInt(parts[idx + 3]!, 16);
    let size: number;
    if (idx + 4 < parts.length) {
      size = parseInt(parts[idx + 4]!, 16);
    } else {
      const cont = lines[i + 1]?.trim().split(/\s+/) ?? [];
      if (cont.length === 0) return null;
      size = parseInt(cont[0]!, 16);
    }
    if (!Number.isNaN(addr) && !Number.isNaN(off) && !Number.isNaN(size)) {
      return { addr, off, size };
    }
  }
  return null;
}

async function peTextSection(
  processService: IHostProcessService,
  target: string,
): Promise<TextSection | null> {
  const result = await runCommand(processService, 'objdump', ['-h', target]);
  if (result.exitCode !== 0) return null;
  for (const line of result.output.split('\n')) {
    const parts = line.trim().split(/\s+/);
    const idx = parts.indexOf('.text');
    if (idx === -1 || idx + 5 > parts.length) continue;
    const size = parseInt(parts[idx + 1]!, 16);
    const addr = parseInt(parts[idx + 2]!, 16);
    const off = parseInt(parts[idx + 4]!, 16);
    if (!Number.isNaN(addr) && !Number.isNaN(off) && !Number.isNaN(size)) {
      return { addr, off, size };
    }
  }
  return null;
}

export function objdumpArchFlag(arch: ReArch): string {
  switch (arch) {
    case 'x86':
      return 'i386';
    case 'x86_64':
      return 'i386:x86-64';
    case 'mips':
      return 'mips';
    case 'arm':
      return 'arm';
  }
}
