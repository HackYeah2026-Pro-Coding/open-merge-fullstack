import { gzipSync } from 'node:zlib';
import { RepoSnapshot, SnapshotTooLargeError, snapshotLoader } from './repo-snapshot';
import { repoTarball, tarArchive } from './tar-fixtures';

describe('RepoSnapshot', () => {
  const files = {
    'README.md': '# Widgets',
    'src/math.js': 'export const one = 1;',
    'src/util/strings.js': 'export const trim = (s) => s.trim();',
    'test/math.test.js': 'test()',
  };

  it('drops GitHub\'s top-level folder from every path', async () => {
    const snapshot = await RepoSnapshot.fromTarball(repoTarball(files));
    expect(snapshot.entries().map(([path]) => path)).toEqual(['README.md', 'src/math.js', 'src/util/strings.js', 'test/math.test.js']);
    expect(snapshot.file('src/math.js')?.toString()).toBe('export const one = 1;');
    expect(snapshot.file('acme-widgets-abc1234/src/math.js')).toBeUndefined();
  });

  it('lists a directory with folders first and counts what is below each folder', async () => {
    const snapshot = await RepoSnapshot.fromTarball(repoTarball(files));
    expect(snapshot.directory('')).toEqual([
      { name: 'src', type: 'dir', size: 2 },
      { name: 'test', type: 'dir', size: 1 },
      { name: 'README.md', type: 'file', size: 9 },
    ]);
    expect(snapshot.directory('src')).toEqual([
      { name: 'util', type: 'dir', size: 1 },
      { name: 'math.js', type: 'file', size: 21 },
    ]);
    expect(snapshot.directory('docs')).toBeUndefined();
    expect(snapshot.directory('src/math.js')).toBeUndefined();
  });

  it('refuses a repository that unpacks to more than the limit', async () => {
    // Zeros compress to almost nothing, like a repository full of generated files.
    const bomb = gzipSync(tarArchive([{ type: 'file', path: 'r/zeros.bin', content: Buffer.alloc(2 * 1024 * 1024) }]));
    expect(bomb.length).toBeLessThan(10_000);
    await expect(RepoSnapshot.fromTarball(bomb, 1024 * 1024)).rejects.toThrow(new SnapshotTooLargeError(1024 * 1024));
  });

  it('rejects data that is not gzip', async () => {
    await expect(RepoSnapshot.fromTarball(Buffer.from('not a tarball'))).rejects.toThrow();
  });
});

describe('snapshotLoader', () => {
  it('downloads once however many tools ask, and not at all until one does', async () => {
    const download = jest.fn().mockResolvedValue(repoTarball({ 'a.txt': 'a' }));
    const load = snapshotLoader(download);
    expect(download).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([load(), load()]);
    expect(first).toBe(second);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('keeps reporting a failed download instead of retrying it on every call', async () => {
    const download = jest.fn().mockRejectedValue(new Error('GitHub returned 404'));
    const load = snapshotLoader(download);
    await expect(load()).rejects.toThrow('404');
    await expect(load()).rejects.toThrow('404');
    expect(download).toHaveBeenCalledTimes(1);
  });
});
