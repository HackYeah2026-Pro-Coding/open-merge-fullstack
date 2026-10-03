import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { STAGES, materialize, stageFiles, treeOf, type Stage } from './stages';

/** Runs the stage's own tests, then probes the behaviour the bounty's acceptance criteria describe. */
function run(stage: Stage) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `fair-split-${stage}-`));
  materialize(stage, dir);

  let testsPass = true;
  try {
    execFileSync(process.execPath, ['--test'], { cwd: dir, stdio: 'pipe' });
  } catch (error) {
    // A failing run exits non-zero, which is exactly what this probe reports.
    if (!(error instanceof Error && 'status' in error)) throw error;
    testsPass = false;
  }

  const probe = `
    import { splitBill } from './src/splitBill.js';
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    let exact = true;
    let spread = true;
    for (let total = 0; total <= 300; total++) {
      for (let people = 1; people <= 9; people++) {
        const shares = splitBill(total, people);
        if (sum(shares) !== total) exact = false;
        if (Math.max(...shares) - Math.min(...shares) > 1) spread = false;
      }
    }
    let rejectsZero = false;
    try { splitBill(1000, 0); } catch (error) { rejectsZero = error instanceof RangeError; }
    console.log(JSON.stringify({ example: splitBill(10000, 3), exact, spread, rejectsZero }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: dir, encoding: 'utf8' });
  return { testsPass, ...(JSON.parse(out) as { example: number[]; exact: boolean; spread: boolean; rejectsZero: boolean }) };
}

describe('the demo repository stages', () => {
  it('layers the stages: later ones replace earlier files and keep the rest', () => {
    const paths = (stage: Stage) => treeOf(stage).map((f) => f.path);
    expect(paths('base')).toEqual(expect.arrayContaining(['src/splitBill.js', 'test/splitBill.test.js', '.github/workflows/ci.yml']));
    expect(stageFiles('v1').map((f) => f.path)).toEqual(['src/splitBill.js']);
    expect(stageFiles('v2').map((f) => f.path)).toEqual(['src/splitBill.js', 'test/splitBill.test.js']);
    expect(new Set(paths('v2'))).toEqual(new Set(paths('base')));
    expect(treeOf('v2').find((f) => f.path === 'src/splitBill.js')?.content).toContain('RangeError');
    expect(STAGES).toEqual(['base', 'v1', 'v2']);
  });

  it('baseline: CI is green, but the bug is real', () => {
    const result = run('base');
    expect(result.testsPass).toBe(true);
    expect(result.example).toEqual([3333, 3333, 3333]);
    expect(result.exact).toBe(false);
    expect(result.rejectsZero).toBe(false);
  });

  it('first fix: CI is green and the shares now overshoot, so a reviewer has something to reject', () => {
    const result = run('v1');
    expect(result.testsPass).toBe(true);
    expect(result.example).toEqual([3334, 3334, 3334]);
    expect(result.exact).toBe(false);
    expect(result.spread).toBe(true);
    expect(result.rejectsZero).toBe(false);
  });

  it('finished fix: meets every acceptance criterion of the issue', () => {
    const result = run('v2');
    expect(result.testsPass).toBe(true);
    expect(result.example).toEqual([3334, 3333, 3333]);
    expect(result.exact).toBe(true);
    expect(result.spread).toBe(true);
    expect(result.rejectsZero).toBe(true);
  });
});
