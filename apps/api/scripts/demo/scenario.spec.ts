import { issueBody, loadScenario, pullRequestBody, renderTemplate } from './scenario';

describe('renderTemplate', () => {
  it('fills every placeholder, repeated ones too', () => {
    expect(renderTemplate('{{a}} and {{a}} and {{b}}', { a: 'x', b: 2 })).toBe('x and x and 2');
  });

  it('fails on a placeholder without a value instead of sending it to GitHub', () => {
    expect(() => renderTemplate('Closes #{{issueNumber}} in {{repoUrl}}', { repoUrl: 'u' })).toThrow('{{issueNumber}}');
  });
});

describe('the demo scenario', () => {
  const scenario = loadScenario();

  it('loads and ties the bounty to a repository of the demo', () => {
    expect(scenario.repo.name).toBe('fair-split');
    expect(scenario.bounty.rewardTokens).toBeGreaterThan(0);
    expect(scenario.bounty.body.length).toBeGreaterThan(0);
  });

  it('has an issue body with the receipt and acceptance criteria, in Markdown the app can render', () => {
    const body = issueBody(scenario);
    expect(body).toContain('## Acceptance criteria');
    expect(body).toContain('Collected');
    // The app's Markdown has neither images nor task lists, so the demo issue must not use them.
    expect(body).not.toMatch(/!\[/);
    expect(body).not.toMatch(/^- \[[ x]\]/m);
  });

  it('makes the pull request close the bounty issue, which is how the review finds it', () => {
    expect(pullRequestBody(scenario, 12)).toMatch(/^Closes #12$/m);
  });
});
