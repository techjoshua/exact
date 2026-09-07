import { spawnSync } from 'node:child_process';

// Run the shared browser contracts against already-built native Bun artifacts.
const result = spawnSync(
	process.execPath,
	['../node_modules/@playwright/test/cli.js', 'test', '-c', 'playwright.config.ts'],
	{
		cwd: new URL('..', import.meta.url),
		env: { ...process.env, COMPARISON_E2E_RUNTIME: 'bun' },
		stdio: 'inherit',
		windowsHide: true
	}
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
