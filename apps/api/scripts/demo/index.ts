import { parseArgs } from 'node:util';
import { COMMANDS, USAGE, isCommand, runCommand } from './commands';
import { loadDotenv } from './env';
import { UsageError } from './errors';

/**
 * Demo tooling entry point: pnpm demo:<command>. See demo/README.md for the full walkthrough.
 */
async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { yes: { type: 'boolean' }, now: { type: 'boolean' }, timeout: { type: 'string' } },
  });
  const command = positionals[0];
  if (!isCommand(command)) {
    throw new UsageError(`${command ? `Unknown command "${command}". Commands: ${COMMANDS.join(', ')}\n\n` : ''}${USAGE}`);
  }

  const timeout = values.timeout === undefined ? null : Number(values.timeout);
  if (timeout !== null && !(timeout > 0)) throw new UsageError('--timeout is a number of seconds, for example --timeout=300');

  loadDotenv();
  await runCommand(command, { yes: values.yes ?? false, now: values.now ?? false, timeoutSeconds: timeout });
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  // Anything else is a bug or an outage: crash with the full stack.
  throw error;
});
