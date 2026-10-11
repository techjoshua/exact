import { spawnSync } from 'node:child_process';

// Gobco's copied module needs repository package resolution. Individual tests retain the
// ordinary system temp boundary so incidental workspace dependencies cannot change fixtures.
const temporary = process.env.EXACT_CONFIDENCE_TEST_TMPDIR;
if (!temporary || process.argv.length < 3) throw new Error('Missing native test execution context');
const result = spawnSync(process.argv[2], process.argv.slice(3), {
	stdio: 'inherit',
	env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary }
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Native test terminated with ${result.signal}`);
process.exitCode = result.status ?? 1;
