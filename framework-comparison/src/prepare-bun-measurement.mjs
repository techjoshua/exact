import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { availableSsrRuntimes } from './ssr-run-environment.mjs';

// Native artifacts and their browser contracts must precede any selected Bun measurements.
if (availableSsrRuntimes().some((runtime) => runtime.id === 'bun')) {
	for (const script of ['build-bun.mjs', 'test-bun-browser.mjs']) {
		const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
			stdio: 'inherit',
			windowsHide: true
		});
		if (result.error) throw result.error;
		if (result.status !== 0) throw new Error(`Bun measurement preparation failed: ${script}`);
	}
}
