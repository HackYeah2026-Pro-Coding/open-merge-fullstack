import { tarArchive } from './tar-fixtures';
import { TarFormatError, readTar } from './tar-reader';

describe('readTar', () => {
  it('returns regular files with their content and skips directories, links and the global header', () => {
    const files = readTar(
      tarArchive([
        { type: 'global', comment: '703b2b8290b0fd55a2b7e85f0dbd5e0e2654bb72' },
        { type: 'dir', path: 'acme-widgets-703b2b8/' },
        { type: 'file', path: 'acme-widgets-703b2b8/math.js', content: 'export const one = 1;\n' },
        { type: 'symlink', path: 'acme-widgets-703b2b8/link.js', target: 'math.js' },
        { type: 'file', path: 'acme-widgets-703b2b8/empty.txt', content: '' },
      ]),
    );
    expect(files.map((f) => [f.path, f.data.toString()])).toEqual([
      ['acme-widgets-703b2b8/math.js', 'export const one = 1;\n'],
      ['acme-widgets-703b2b8/empty.txt', ''],
    ]);
  });

  it('takes long paths from pax headers and GNU long names, for the next entry only', () => {
    const deep = `acme-widgets-703b2b8/${'nested/'.repeat(20)}file.ts`;
    const longer = `acme-widgets-703b2b8/${'other/'.repeat(25)}file.ts`;
    const files = readTar(
      tarArchive([
        { type: 'pax', path: deep },
        { type: 'file', path: deep.slice(0, 100), content: 'a' },
        { type: 'gnu-longname', path: longer },
        { type: 'file', path: longer.slice(0, 100), content: 'b' },
        { type: 'file', path: 'acme-widgets-703b2b8/short.ts', content: 'c' },
      ]),
    );
    expect(files.map((f) => f.path)).toEqual([deep, longer, 'acme-widgets-703b2b8/short.ts']);
  });

  it('reads data that spans several blocks and keeps the following header aligned', () => {
    const big = 'x'.repeat(1300);
    const files = readTar(
      tarArchive([
        { type: 'file', path: 'r/big.txt', content: big },
        { type: 'file', path: 'r/after.txt', content: 'after' },
      ]),
    );
    expect(files.map((f) => [f.path, f.data.length])).toEqual([
      ['r/big.txt', 1300],
      ['r/after.txt', 5],
    ]);
  });

  it('rejects a truncated archive instead of returning part of it', () => {
    const archive = tarArchive([{ type: 'file', path: 'r/big.txt', content: 'x'.repeat(2000) }]);
    expect(() => readTar(archive.subarray(0, 1024))).toThrow(TarFormatError);
  });

  it('rejects a header with a corrupt size field', () => {
    const archive = tarArchive([{ type: 'file', path: 'r/a.txt', content: 'a' }]);
    archive.write('zzzzzzzzzzz', 124, 'ascii');
    expect(() => readTar(archive)).toThrow(TarFormatError);
  });
});
