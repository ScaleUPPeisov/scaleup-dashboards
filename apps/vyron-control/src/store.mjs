import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function initialState() {
  return {
    version: 1,
    channels: {},
    events: [],
    completedSlots: [],
    localQuota: { day: null, spent: 0 },
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastSource: null
  };
}

export class JsonStore {
  constructor(path) {
    this.path = path;
    this.data = initialState();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      if (!parsed || parsed.version !== 1 || !parsed.channels ||
          !Array.isArray(parsed.events) || !Array.isArray(parsed.completedSlots) ||
          !parsed.localQuota) throw new Error('Incompatible state format');
      this.data = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // corrupted data: fail closed
    }
    return this.data;
  }

  async save() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(this.data, null, 2), { mode: 0o600, flag: 'wx' });
      await chmod(temp, 0o600);
      await rename(temp, this.path);
    } catch (error) {
      try { await (await import('node:fs/promises')).unlink(temp); } catch { /* ignore */ }
      throw error;
    }
  }
}
