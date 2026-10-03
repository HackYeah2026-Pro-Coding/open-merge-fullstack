/** A regular file inside a tar archive. */
export interface TarFile {
  path: string;
  data: Buffer;
}

const BLOCK = 512;

/** Thrown for an archive that cannot be read; never for content that is merely unexpected. */
export class TarFormatError extends Error {
  constructor(message: string) {
    super(`Malformed tar archive: ${message}`);
    this.name = 'TarFormatError';
  }
}

function text(header: Buffer, offset: number, length: number): string {
  const field = header.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? length : end).toString('utf8');
}

function octal(header: Buffer, offset: number, length: number): number {
  const value = text(header, offset, length).trim();
  if (!/^[0-7]+$/.test(value)) throw new TarFormatError(`invalid number "${value}" at byte ${offset}`);
  return parseInt(value, 8);
}

/** Records of a pax extended header: "<length> <key>=<value>\n" repeated. */
function paxRecords(data: Buffer): Map<string, string> {
  const records = new Map<string, string>();
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = parseInt(data.subarray(offset, space).toString('ascii'), 10);
    if (!Number.isInteger(length) || length <= 0) throw new TarFormatError('invalid pax record length');
    const record = data.subarray(space + 1, offset + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals !== -1) records.set(record.slice(0, equals), record.slice(equals + 1));
    offset += length;
  }
  return records;
}

/**
 * The regular files of an uncompressed tar archive, as GitHub's tarball endpoint
 * produces it: ustar headers, pax extended headers for long paths, and GNU long names.
 * Directories, links and other entry types are skipped.
 */
export function readTar(archive: Buffer): TarFile[] {
  const files: TarFile[] = [];
  let nextPath: string | undefined;
  let offset = 0;

  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    // Two zero blocks end the archive; one is enough to stop.
    if (header.every((byte) => byte === 0)) break;

    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const dataStart = offset + BLOCK;
    if (dataStart + size > archive.length) throw new TarFormatError('entry runs past the end of the archive');
    const data = archive.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'x') {
      nextPath = paxRecords(data).get('path') ?? nextPath;
      continue;
    }
    if (type === 'L') {
      nextPath = text(data, 0, data.length);
      continue;
    }
    if (type === 'g') continue;

    const name = text(header, 0, 100);
    const prefix = text(header, 257, 6) === 'ustar' ? text(header, 345, 155) : '';
    const path = nextPath ?? (prefix ? `${prefix}/${name}` : name);
    nextPath = undefined;
    if (type === '0' || type === '7') files.push({ path, data });
  }
  return files;
}
