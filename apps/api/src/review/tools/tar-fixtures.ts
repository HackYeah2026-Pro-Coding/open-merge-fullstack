import { gzipSync } from 'node:zlib';

/** Test helper: one entry of a tar archive to build. */
export type TarEntry =
  | { type: 'file'; path: string; content: string | Buffer }
  | { type: 'dir'; path: string }
  | { type: 'symlink'; path: string; target: string }
  /** A pax extended header, which GitHub writes before entries whose path is too long for ustar. */
  | { type: 'pax'; path: string }
  /** The global pax header GitHub puts first, carrying the commit id. */
  | { type: 'global'; comment: string }
  | { type: 'gnu-longname'; path: string };

function header(name: string, size: number, type: string, linkName = ''): Buffer {
  const block = Buffer.alloc(512);
  block.write(name.slice(0, 100), 0, 'utf8');
  block.write('0000644\0', 100, 'ascii');
  block.write('0000000\0', 108, 'ascii');
  block.write('0000000\0', 116, 'ascii');
  block.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
  block.write('00000000000\0', 136, 'ascii');
  block.write('        ', 148, 'ascii');
  block.write(type, 156, 'ascii');
  block.write(linkName, 157, 'utf8');
  block.write('ustar\0', 257, 'ascii');
  block.write('00', 263, 'ascii');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
  return block;
}

function withData(name: string, type: string, data: Buffer): Buffer[] {
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  return [header(name, data.length, type), data, padding];
}

function paxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`;
  // The length prefix counts itself, so grow it until it is stable.
  let length = body.length + 1;
  while (String(length).length + body.length !== length) length = String(length).length + body.length;
  return Buffer.from(`${length}${body}`, 'utf8');
}

/** Builds an uncompressed tar archive in the layout GitHub's tarball endpoint uses. */
export function tarArchive(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    switch (entry.type) {
      case 'file':
        parts.push(...withData(entry.path, '0', Buffer.from(entry.content)));
        break;
      case 'dir':
        parts.push(header(entry.path, 0, '5'));
        break;
      case 'symlink':
        parts.push(header(entry.path, 0, '2', entry.target));
        break;
      case 'pax':
        parts.push(...withData('pax_header', 'x', paxRecord('path', entry.path)));
        break;
      case 'global':
        parts.push(...withData('pax_global_header', 'g', paxRecord('comment', entry.comment)));
        break;
      case 'gnu-longname':
        parts.push(...withData('././@LongLink', 'L', Buffer.from(`${entry.path}\0`)));
        break;
    }
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

/** The gzipped archive of a repository at one commit, with GitHub's top-level folder. */
export function repoTarball(files: Record<string, string | Buffer>, folder = 'acme-widgets-abc1234'): Buffer {
  const entries: TarEntry[] = [{ type: 'global', comment: 'abc1234' }, { type: 'dir', path: `${folder}/` }];
  for (const [path, content] of Object.entries(files)) {
    const full = `${folder}/${path}`;
    if (Buffer.byteLength(full) > 100) entries.push({ type: 'pax', path: full });
    entries.push({ type: 'file', path: full, content });
  }
  return gzipSync(tarArchive(entries));
}
