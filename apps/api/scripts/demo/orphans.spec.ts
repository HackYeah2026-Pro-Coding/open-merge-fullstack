import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { recordOrphanedEscrows, type OrphanedEscrow } from './orphans';

const entry = (escrowAddress: string): OrphanedEscrow => ({
  escrowAddress,
  rewardBaseUnits: '50000000',
  repo: 'Acme/fair-split',
  issueNumber: 7,
  recordedAt: '2026-10-04T10:00:00.000Z',
});

describe('recordOrphanedEscrows', () => {
  let file: string;

  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orphans-')), 'orphans.json');
  });

  it('creates the file on first use', () => {
    recordOrphanedEscrows(file, [entry('A')]);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([entry('A')]);
  });

  it('appends later entries and never lists an escrow twice', () => {
    recordOrphanedEscrows(file, [entry('A')]);
    recordOrphanedEscrows(file, [entry('A'), entry('B')]);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).map((e: OrphanedEscrow) => e.escrowAddress)).toEqual(['A', 'B']);
  });

  it('refuses a file it cannot read instead of overwriting what is there', () => {
    fs.writeFileSync(file, '{"not": "a list"}');
    expect(() => recordOrphanedEscrows(file, [entry('A')])).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('{"not": "a list"}');
  });
});
