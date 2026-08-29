import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function safeDirectory(directory) {
  const status = await lstat(directory).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (status?.isSymbolicLink()) throw new Error(`artifact directory is a symlink: ${directory}`);
  if (status && !status.isDirectory()) throw new Error(`artifact path is not a directory: ${directory}`);
  if (!status) await mkdir(directory, { recursive: false });
}

export class ArtifactStore {
  constructor(root) {
    this.root = path.resolve(root);
    this.objects = path.join(this.root, 'objects');
    this.manifests = path.join(this.root, 'manifests');
  }

  async #initialize() {
    const rootStatus = await lstat(this.root).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (rootStatus?.isSymbolicLink()) throw new Error('artifact root is a symlink');
    if (!rootStatus) await mkdir(this.root, { recursive: true });
    await safeDirectory(this.objects);
    await safeDirectory(this.manifests);
  }

  async put({ logicalName, mediaType, bytes }) {
    if (!/^[a-z0-9][a-z0-9._-]{0,119}$/i.test(logicalName)) throw new Error('invalid logical name');
    if (!Buffer.isBuffer(bytes)) throw new TypeError('artifact bytes must be a Buffer');
    await this.#initialize();
    const sha256 = hash(bytes);
    const shard = path.join(this.objects, sha256.slice(0, 2));
    await safeDirectory(shard);
    const object = path.join(shard, sha256);
    const existing = await readFile(object).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (existing && hash(existing) !== sha256) throw new Error('existing artifact hash mismatch');
    if (!existing) {
      const temporary = `${object}.${randomUUID()}.partial`;
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, object);
    }
    const manifest = { id: `artifact_${sha256.slice(0, 24)}`, logicalName, mediaType, sha256, bytes: bytes.length };
    const manifestPath = path.join(this.manifests, `${sha256}.json`);
    const temporaryManifest = `${manifestPath}.${randomUUID()}.partial`;
    await writeFile(temporaryManifest, `${JSON.stringify(manifest)}\n`, { flag: 'wx' });
    await rename(temporaryManifest, manifestPath);
    return manifest;
  }

  async get(sha256) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('invalid artifact hash');
    await this.#initialize();
    const shard = path.join(this.objects, sha256.slice(0, 2));
    await safeDirectory(shard);
    const bytes = await readFile(path.join(shard, sha256));
    if (hash(bytes) !== sha256) throw new Error('artifact hash mismatch');
    return bytes;
  }

  async list() {
    await this.#initialize();
    const files = (await readdir(this.manifests)).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).sort();
    return Promise.all(files.map(async (name) => JSON.parse(await readFile(path.join(this.manifests, name), 'utf8'))));
  }
}
