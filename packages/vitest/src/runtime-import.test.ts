import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('installed runtime helper imports', () => {
	it('does not initialize compiler tools in a different typed-array realm', () => {
		// A fresh process avoids a cached compiler import hiding jsdom's realm mismatch.
		const script = `
			import vm from 'node:vm';
			globalThis.Uint8Array = vm.runInNewContext('Uint8Array');
			const helpers = await import('@exactjs/vitest');
			if (typeof helpers.testComponent !== 'function') throw new Error('Missing testing helpers');
		`;
		expect(() =>
			execFileSync(process.execPath, ['--input-type=module', '-e', script], {
				cwd: new URL('../', import.meta.url),
				stdio: 'pipe'
			})
		).not.toThrow();
	});
});
