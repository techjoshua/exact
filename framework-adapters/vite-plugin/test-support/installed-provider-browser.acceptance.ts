import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { it, onTestFinished } from 'vitest';
import { exact } from '../src/index.js';
import { createInstalledProviderFixture } from '../../test-support/installed-provider.js';
import { copyInstalledRuntimePackages } from '../../test-support/installed-runtime-packages.js';

it('hydrates installed transparent providers without an authored shell anchor or optimizer rules', async () => {
	const fixture = await createInstalledProviderFixture();
	onTestFinished(fixture.dispose);
	await copyInstalledRuntimePackages(fixture.root, [
		'@exactjs/hydrate',
		'@exactjs/devtools-runtime'
	]);
	await writeFile(
		path.join(fixture.root, 'Page.tsx'),
		`import {Provider,Toggle} from '@fixture/page';
/** @exact server */
export function Page(){return()=> <main><Provider appearance="light" cookieName="provider-appearance"><section><Toggle/><p data-retained>Retained content</p></section></Provider></main>;}`
	);
	await writeFile(
		path.join(fixture.root, 'server.tsx'),
		`import {Page} from './Page.js';import {renderToHydratableString} from '@exactjs/ssr';export const output=()=>renderToHydratableString(<Page/>);`
	);
	await writeFile(
		path.join(fixture.root, 'client.ts'),
		`import {createExactClient,lazyClientIsland} from '@exactjs/hydrate';const errors:unknown[]=[];window.addEventListener('error',e=>errors.push(e.message));const root=document.getElementById('app')!;const retained=root.querySelector('[data-retained]');createExactClient(root,{islands:{Provider:lazyClientIsland(()=>import('@fixture/page').then(m=>m.Provider)),Toggle:lazyClientIsland(()=>import('@fixture/page').then(m=>m.Toggle))},hydration:{strategy:'eager'},onErrorReport:r=>errors.push(String(r.error))});Object.assign(window,{observation:()=>({retained:retained===root.querySelector('[data-retained]'),errors})});`
	);
	const vite = await createServer({
		root: fixture.root,
		configFile: false,
		appType: 'custom',
		logLevel: 'error',
		cacheDir: path.join(fixture.root, '.custom-cache'),
		plugins: [exact({ serverComponents: true, reactCompatibility: false })],
		server: { host: '127.0.0.1', port: 0 }
	});
	vite.middlewares.use(async (request, response, next) => {
		if (request.url !== '/') return next();
		try {
			const module = await vite.ssrLoadModule('/server.tsx');
			const result = await module.output();
			const html = await vite.transformIndexHtml(
				'/',
				`<div id="app">${result.html}</div><script type="module" src="/client.ts"></script>`
			);
			response.setHeader('Content-Type', 'text/html');
			response.end(html);
		} catch (error) {
			next(error);
		}
	});
	try {
		await vite.listen();
		const address = vite.httpServer!.address();
		if (!address || typeof address === 'string') throw new Error('Fixture has no TCP listener');
		await promisify(execFile)(
			process.execPath,
			[
				fileURLToPath(
					new URL('../../test-support/installed-provider-browser.mjs', import.meta.url)
				),
				`http://127.0.0.1:${address.port}`
			],
			{ timeout: 45_000 }
		);
	} finally {
		await vite.close();
	}
}, 60_000);
