import { verifyFormBindingControls } from '../../packages/component-composition-corpus/test-support/form-binding-journey.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { startInstalledIslandsHttp } from './installed-islands-http.mjs';
import { verifyInstalledOwnerJourney } from './installed-owner-journey.mjs';

/** Owns Chromium and loopback delivery for the shared source-removed library journey. */
export async function verifyInstalledBrowser(root) {
	const server = await import(pathToFileURL(path.join(root, 'out/server.mjs')).href);
	const deployment = await startInstalledIslandsHttp(
		server,
		await readFile(path.join(root, 'out/client.mjs'), 'utf8')
	);
	try {
		const require = createRequire(
			new URL('../../scripts/runtime-acceptance/package.json', import.meta.url)
		);
		const { chromium } = await import(pathToFileURL(require.resolve('playwright')).href);
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			await page.goto(deployment.origin);
			await page.addScriptTag({
				type: 'module',
				content: "import * as runtime from '/client.mjs';window.__installedRuntime=runtime;"
			});
			await page.waitForFunction(() => Boolean(window.__installedRuntime));
			await page.evaluate(
				async ({ origin, journey, formJourney }) => {
					const runtime = window.__installedRuntime;
					const verify = (0, eval)('(' + journey + ')');
					await verify(runtime, origin, (0, eval)('(' + formJourney + ')'));
				},
				{
					origin: deployment.origin,
					journey: verifyInstalledOwnerJourney.toString(),
					formJourney: verifyFormBindingControls.toString()
				}
			);
			assert.deepEqual(errors, []);
			assert.deepEqual(deployment.errors, []);
			assert.deepEqual(
				deployment.requests.filter((request) => request.path === '/__exact'),
				Array.from({ length: 4 }, () => ({ method: 'POST', path: '/__exact' }))
			);
		} finally {
			await browser.close();
		}
	} finally {
		await deployment.dispose();
	}
}
