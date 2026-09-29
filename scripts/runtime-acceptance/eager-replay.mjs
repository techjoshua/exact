import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import {
	compileFileArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '@exactjs/compiler';
import assert from 'node:assert/strict';

/** Builds a compiler-owned eager boundary and a controllably delayed browser loader for every host. */
export async function prepareEagerReplay(temporary, fixture) {
	const source = path.join(temporary, 'EagerAppearance.tsx');
	await writeFile(source, await readFile(path.join(fixture, 'EagerAppearance.tsx')));
	const artifact = await compileFileArtifacts(source, {
		rootDir: temporary,
		outDir: path.join(temporary, 'eager'),
		serverComponents: true
	});
	const graph = createExactArtifactGraph([artifact], {
		rootDir: temporary,
		sourceRoot: temporary,
		packageRoot: temporary
	});
	await writeFile(
		path.join(temporary, 'eager-registration.ts'),
		createExactHydrationRegistrationModule(graph)
	);
	const client = path.join(temporary, 'eager-client.ts');
	await writeFile(
		client,
		`import {exactHydrationRegistration} from './eager-registration.js';
import {createExactClient,readExactHydrationConfig} from '@exactjs/hydrate';
const gate=new Promise<void>(resolve=>{window.releaseEager=resolve;});
const islands=Object.fromEntries(Object.entries(exactHydrationRegistration.islands).map(([name,entry])=>[name,{...entry,load:()=>{window.eagerLoading=true;return gate.then(()=>entry.load());}}]));
window.eagerClient=createExactClient(document.getElementById('root'),{...readExactHydrationConfig(document),...exactHydrationRegistration,islands});
await window.eagerClient.whenSettled();window.eagerReady=true;`
	);
	const bundled = await build({
		entryPoints: [client],
		bundle: true,
		platform: 'browser',
		format: 'esm',
		write: false
	});
	const handler = path.join(temporary, 'eager-handler.mjs');
	await writeFile(
		handler,
		`import {EagerPage} from ${JSON.stringify(artifact.serverFile)};
import '@exactjs/ssr/runtime/structural-boundaries';
import {createCompiledDocumentReceipt as documentReceipt,createCompiledIntrinsicReceipt as element,createCompiledComponentReceipt as receipt} from '@exactjs/core/runtime/component-operations';
import {renderToHydratableString,renderToHydratableProgressiveHtmlResponse} from '@exactjs/ssr';
import {exactResponseToFetchResponse} from '@exactjs/server';
export async function eagerReplayResponse(request){
 const url=new URL(request.url);
 if(url.pathname==='/eager-client.js') return new Response(${JSON.stringify(bundled.outputFiles[0].text)},{headers:{'content-type':'text/javascript'}});
 const options={hydration:true,documentShell:application=>documentReceipt(null,element('main',{id:'root'},application)),documentAssets:{bootstrapLoading:'normal',bootstrap:[{src:'/eager-client.js'}]}};
 if(url.searchParams.has('stream')) return exactResponseToFetchResponse(await renderToHydratableProgressiveHtmlResponse(receipt(EagerPage,{}),options));
 return new Response((await renderToHydratableString(receipt(EagerPage,{}),options)).htmlWithHydration,{headers:{'content-type':'text/html'}});
}`
	);
	return handler;
}

/** Selects before module release, then verifies exactly one replay and a subsequent ordinary change. */
export async function checkEagerReplay(origin, browser) {
	for (const stream of [false, true]) {
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		try {
			await page.goto(new URL('/eager-page' + (stream ? '?stream' : ''), origin).href);
			await page.waitForFunction(() => window.eagerLoading === true);
			assert.equal(await page.locator('[data-exact-client-hydrated="true"]').count(), 0);
			await page.selectOption('select', 'light');
			assert.equal(await page.locator('output').textContent(), 'system:0');
			if (stream) await page.evaluate(() => window.eagerClient.registerComponents({ islands: {} }));
			await page.evaluate(() => window.releaseEager());
			await page.waitForFunction(() => window.eagerReady === true);
			assert.equal(await page.locator('select').inputValue(), 'light');
			assert.equal(await page.locator('output').textContent(), 'light:1');
			await page.selectOption('select', 'dark');
			await page.evaluate(() => window.eagerClient.whenSettled());
			assert.equal(await page.locator('output').textContent(), 'dark:2');
			await page.evaluate(() => window.eagerClient.dispose());
			await page.selectOption('select', 'light');
			assert.equal(await page.locator('output').textContent(), 'dark:2');
			assert.deepEqual(errors, []);
		} finally {
			await page.close();
		}
	}
}
