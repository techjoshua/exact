import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createInstalledIslandsFixture } from './installed-islands.js';
import { buildInstalledIslands } from './build-installed-islands.js';

/** Owns isolated publication, both bundler targets, observable verification and final fixture cleanup. */
export async function verifyInstalledIslands(adapter: 'vite' | 'webpack' | 'bun', stream: boolean) {
	const fixture = await createInstalledIslandsFixture(stream);
	try {
		await buildInstalledIslands(adapter, fixture.root);
		const verifier = fileURLToPath(new URL('./verify-installed-islands.mjs', import.meta.url));
		const result = await promisify(execFile)(
			adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
			[verifier, fixture.root],
			{ timeout: 30_000 }
		);
		assert.equal(result.stderr, '');
		assert.match(result.stdout, /Installed islands retained identity/);
	} finally {
		await fixture.dispose();
	}
}

/** Rejects incomplete installed artifacts through the actual consumer build, with owned cleanup. */
export async function verifyInvalidInstalledIslands(
	adapter: 'vite' | 'webpack' | 'bun',
	fault: 'missing-facts' | 'incompatible-facts' | 'missing-client'
) {
	const fixture = await createInstalledIslandsFixture(false, fault);
	try {
		await assert.rejects(
			buildInstalledIslands(adapter, fixture.root),
			fault === 'missing-client'
				? /resolve|not found|ENOENT|exist/i
				: /build facts|build-facts|protocol/i
		);
	} finally {
		await fixture.dispose();
	}
}
