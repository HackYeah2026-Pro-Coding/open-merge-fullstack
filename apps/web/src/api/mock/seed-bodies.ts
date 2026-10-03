/** Issue bodies for the seeded bounties, written the way a maintainer would. */
export const BODIES = {
  retryQueue: `Jobs that hit the per-attempt timeout while a retry is already scheduled are removed from the queue instead of being retried.

## Reproduction

1. Configure a queue with \`timeoutMs: 500\` and \`retries: 3\`.
2. Enqueue a job that sleeps for 800 ms on the first attempt.
3. The job is marked \`failed\` after the first timeout and never retried.

## Expected

The timeout counts as a failed attempt and the job is retried with backoff until \`retries\` is exhausted.

## Acceptance criteria

- A regression test that reproduces the drop.
- No duplicate execution when a worker restarts mid-retry.
- \`pnpm test\` passes.`,

  jsonFlag: `Every CLI command prints human-readable tables. Scripts that consume the output have to parse them.

Add a global \`--json\` flag that switches every command to machine-readable output.

## Acceptance criteria

- \`--json\` works on \`list\`, \`inspect\`, \`run\` and \`status\`.
- Output is a single JSON document on stdout; logs go to stderr.
- Snapshot tests for each command.`,

  pluginDocs: `The plugin API is only described in type definitions. New contributors ask the same questions in issues every week.

Write a guide in \`docs/plugins.md\` with runnable examples.

## Acceptance criteria

- One example per hook: \`onEnqueue\`, \`onStart\`, \`onComplete\`, \`onFail\`.
- Examples run as part of \`pnpm test:docs\`.`,

  isoDurations: `Schedule config only accepts milliseconds. Users want to write durations the way they read them.

Accept ISO 8601 durations such as \`PT30S\` and \`P1DT2H\` wherever a duration is configured.

## Acceptance criteria

- Parser with unit tests, including invalid input.
- Numbers keep working as milliseconds.
- No new runtime dependencies.`,

  retryAfter: `When an upstream answers \`429\` with a \`Retry-After\` header, the rate limiter ignores it and retries on its own schedule, which gets us banned faster.

## Acceptance criteria

- Honour \`Retry-After\` in both seconds and HTTP-date form.
- Cap the wait at \`maxRetryDelayMs\`.
- Tests for both header forms.`,

  streaming: `Responses larger than the memory limit crash the worker because the whole body is buffered before parsing.

Stream the body through the parser instead.

## Acceptance criteria

- A 2 GB fixture is processed with peak memory under 200 MB.
- Back-pressure is respected.
- Existing API stays source compatible.`,

  windowsGlob: `On Windows, \`include: ["src\\\\**\\\\*.ts"]\` matches nothing because backslashes are treated as escape characters.

## Acceptance criteria

- Normalise separators before matching.
- Tests run on the Windows CI runner.`,

  memoryLeak: `Each reconnect of the WebSocket transport registers a new \`message\` listener without removing the old one. After a few hours of flaky network the process runs out of memory.

## Acceptance criteria

- Listeners are removed on disconnect.
- A test that reconnects 1,000 times and checks the listener count.`,

  dualBuild: `Consumers on ESM-only toolchains cannot import the package without a bundler workaround.

Ship both ESM and CommonJS builds with correct \`exports\` conditions.

## Acceptance criteria

- \`import\` and \`require\` both work in Node 20 and 22.
- Types resolve under \`moduleResolution: bundler\` and \`node16\`.`,

  intl: `moment.js accounts for 70% of the bundle. Replace it with native \`Intl\` formatting.`,
} as const;
