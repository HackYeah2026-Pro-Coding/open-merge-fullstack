import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { readTar } from './tar-reader';

/** Largest tarball downloaded for one review. */
export const MAX_TARBALL_BYTES = 25 * 1024 * 1024;
/** Largest repository unpacked in memory for one review. */
export const MAX_UNPACKED_BYTES = 150 * 1024 * 1024;

const gunzipAsync = promisify(gunzip);

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'dir';
  /** Bytes for a file; number of files below it for a directory. */
  size: number;
}

/** The repository unpacks to more than the limit, MAX_UNPACKED_BYTES unless a test sets another. */
export class SnapshotTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`The repository is larger than ${Math.round(maxBytes / 1024 / 1024)} MB unpacked`);
    this.name = 'SnapshotTooLargeError';
  }
}

/** Every file of the repository at the reviewed commit, read from GitHub's tarball. Read-only. */
export class RepoSnapshot {
  private constructor(private readonly files: ReadonlyMap<string, Buffer>) {}

  static async fromTarball(gzipped: Buffer, maxUnpackedBytes = MAX_UNPACKED_BYTES): Promise<RepoSnapshot> {
    let archive: Buffer;
    try {
      archive = await gunzipAsync(gzipped, { maxOutputLength: maxUnpackedBytes });
    } catch (error) {
      // Matched by code: zlib's RangeError can come from another realm, where instanceof fails.
      if ((error as NodeJS.ErrnoException | null)?.code === 'ERR_BUFFER_TOO_LARGE') {
        throw new SnapshotTooLargeError(maxUnpackedBytes);
      }
      throw error;
    }
    const files = new Map<string, Buffer>();
    for (const { path, data } of readTar(archive)) {
      // GitHub puts everything under one "<owner>-<repo>-<sha>/" folder.
      const slash = path.indexOf('/');
      if (slash !== -1 && slash < path.length - 1) files.set(path.slice(slash + 1), data);
    }
    return new RepoSnapshot(files);
  }

  /** Content of a file, or undefined when no file has this path. */
  file(path: string): Buffer | undefined {
    return this.files.get(path);
  }

  /** All files, sorted by path. */
  entries(): [string, Buffer][] {
    return [...this.files].sort(([a], [b]) => a.localeCompare(b));
  }

  /** Direct children of a directory ("" for the root), folders first; undefined when it is not a directory. */
  directory(path: string): DirectoryEntry[] | undefined {
    const prefix = path === '' ? '' : `${path}/`;
    const dirs = new Map<string, number>();
    const files: DirectoryEntry[] = [];
    for (const [file, data] of this.files) {
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) files.push({ name: rest, type: 'file', size: data.length });
      else dirs.set(rest.slice(0, slash), (dirs.get(rest.slice(0, slash)) ?? 0) + 1);
    }
    if (dirs.size === 0 && files.length === 0) return undefined;
    const folders = [...dirs].map(([name, size]): DirectoryEntry => ({ name, type: 'dir', size }));
    const byName = (a: DirectoryEntry, b: DirectoryEntry) => a.name.localeCompare(b.name);
    return [...folders.sort(byName), ...files.sort(byName)];
  }
}

/**
 * Loads the snapshot on first use and shares it, so both reviewers of one review
 * cause a single download, and a review whose models use no tools causes none.
 */
export function snapshotLoader(download: () => Promise<Buffer>): () => Promise<RepoSnapshot> {
  let loading: Promise<RepoSnapshot> | undefined;
  return () => (loading ??= download().then((tarball) => RepoSnapshot.fromTarball(tarball)));
}
