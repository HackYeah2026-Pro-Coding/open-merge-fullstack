import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { DEMO_DIR } from './paths';

const name = z.string().trim().min(1);

const scenarioSchema = z.object({
  repo: z.object({ name, description: z.string(), private: z.boolean() }),
  /** Tags in the demo repo that pin the three states of the code. */
  refs: z.object({ baseline: name, v1: name, v2: name }),
  commits: z.object({ baseline: name, v1: name, v2: name }),
  /** The developer's branch. */
  branch: name,
  bounty: z.object({
    title: z.string().trim().min(8).max(256),
    labels: z.array(name).max(10),
    rewardTokens: z.number().int().positive(),
    bodyFile: name,
  }),
  pullRequest: z.object({ title: name, bodyFile: name }),
});

type Parsed = z.infer<typeof scenarioSchema>;

/** scenario.json with the text files it points at read in. The bodies still hold their {{placeholders}}. */
export type Scenario = Omit<Parsed, 'bounty' | 'pullRequest'> & {
  bounty: Parsed['bounty'] & { body: string };
  pullRequest: Parsed['pullRequest'] & { body: string };
};

export function loadScenario(dir: string = DEMO_DIR): Scenario {
  const parsed = scenarioSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'scenario.json'), 'utf8')));
  const read = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
  return {
    ...parsed,
    bounty: { ...parsed.bounty, body: read(parsed.bounty.bodyFile) },
    pullRequest: { ...parsed.pullRequest, body: read(parsed.pullRequest.bodyFile) },
  };
}

/** Fills {{name}} placeholders; a placeholder with no value is an error, not text that ships to GitHub. */
export function renderTemplate(template: string, values: Record<string, string | number>): string {
  const rendered = Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)), template);
  const left = rendered.match(/\{\{\w+\}\}/g);
  if (left) throw new Error(`Template has placeholders with no value: ${[...new Set(left)].join(', ')}`);
  return rendered;
}

/** The issue text as the maintainer would paste it; it has no placeholders, and one that sneaks in is an error. */
export const issueBody = (scenario: Scenario): string => renderTemplate(scenario.bounty.body, {});

export const pullRequestBody = (scenario: Scenario, issueNumber: number): string =>
  renderTemplate(scenario.pullRequest.body, { issueNumber });
