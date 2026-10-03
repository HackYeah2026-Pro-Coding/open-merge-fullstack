import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEMO_DIR } from './paths';

/**
 * The demo repository exists in three states, one folder each under demo/repo:
 *   base  the code with the bug (main)
 *   v1    the developer's first, incomplete fix: only the files it changes
 *   v2    the finished fix on top of v1: only the files it changes
 */
export const STAGES = ['base', 'v1', 'v2'] as const;
export type Stage = (typeof STAGES)[number];

export interface RepoFile {
  /** Repository-relative, with forward slashes. */
  path: string;
  content: string;
}

const REPO_DIR = path.join(DEMO_DIR, 'repo');

/** The files a stage adds or replaces. Text only: they travel to GitHub as UTF-8. */
export function stageFiles(stage: Stage, repoDir: string = REPO_DIR): RepoFile[] {
  const dir = path.join(repoDir, stage);
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => fs.statSync(path.join(dir, entry)).isFile())
    .map((entry) => ({ path: entry.split(path.sep).join('/'), content: fs.readFileSync(path.join(dir, entry), 'utf8') }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** The whole repository at a stage: every earlier stage overlaid by the later ones. */
export function treeOf(stage: Stage, repoDir: string = REPO_DIR): RepoFile[] {
  const files = new Map<string, string>();
  for (const earlier of STAGES.slice(0, STAGES.indexOf(stage) + 1)) {
    for (const file of stageFiles(earlier, repoDir)) files.set(file.path, file.content);
  }
  return [...files].map(([filePath, content]) => ({ path: filePath, content }));
}

/** Writes the repository at a stage to disk, so its tests can run. */
export function materialize(stage: Stage, target: string, repoDir: string = REPO_DIR): void {
  for (const file of treeOf(stage, repoDir)) {
    const destination = path.join(target, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content);
  }
}
