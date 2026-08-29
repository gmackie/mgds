import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex');

export class EventLedger {
  constructor(file) {
    this.file = path.resolve(file);
  }

  async entries() {
    const content = await readFile(this.file, 'utf8').catch((error) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    return content.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  }

  async append(event) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const entries = await this.entries();
    if (entries.length > 0) await this.verify();
    const body = {
      sequence: entries.length + 1,
      previousHash: entries.at(-1)?.hash ?? '0'.repeat(64),
      event,
    };
    const entry = { ...body, hash: digest(body) };
    await appendFile(this.file, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', flag: 'a' });
    return entry;
  }

  async verify() {
    const entries = await this.entries();
    let previousHash = '0'.repeat(64);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const body = { sequence: entry.sequence, previousHash: entry.previousHash, event: entry.event };
      if (entry.sequence !== index + 1 || entry.previousHash !== previousHash || entry.hash !== digest(body)) {
        throw new Error(`ledger hash mismatch at sequence ${index + 1}`);
      }
      previousHash = entry.hash;
    }
    return true;
  }
}
