import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { compileProjectArtifacts } from '@exactjs/compiler';
import assert from 'node:assert/strict';

/** Builds one shared owner journey against paired component artifacts and browser runtime entries. */
export async function preparePendingOwnerBrowser(root, temporary) {
	const source = path.join(root, 'packages/component-composition-corpus/src');
	const fixture = path.join(source, 'test-support/pending-owner-overlap.fixtures.tsx');
	const harness = path.join(source, 'test-support/pending-owner-harness.ts');
	const journey = path.join(source, 'test-support/pending-owner-journey.ts');
	const tone = path.join(source, 'scenarios/enhancement-implementation.fixtures.tsx');
	const artifacts = await compileProjectArtifacts([fixture, harness, journey, tone], {
		rootDir: root,
		outDir: path.join(temporary, 'pending-owner')
	});
	const artifact = (file) => {
		const value = artifacts.find((a) => a.inputFile === file);
		assert.ok(value, 'Missing pending-owner artifact ' + file);
		return value;
	};
	const client = path.join(temporary, 'pending-owner-client.ts');
	await writeFile(
		client,
		`import {createPendingOwnerHarness} from ${JSON.stringify(artifact(harness).clientFile)};
import {verifyPendingOwnerOverlap,verifyPendingOwnerSequence} from ${JSON.stringify(artifact(journey).clientFile)};
const harness=()=>createPendingOwnerHarness(async props=>{const query=new URLSearchParams({id:props.id,enhanced:String(props.enhanced)});if(props.label!==undefined)query.set('label',props.label);const response=await fetch('/pending-owner-state?'+query);if(!response.ok)throw new Error('Pending owner SSR failed');return response.json();});
export async function verify(entry,enhanced){await verifyPendingOwnerOverlap(harness(),entry,enhanced);}
export async function sequence(entry,enhanced,seed){await verifyPendingOwnerSequence(harness(),entry,enhanced,seed);}`
	);
	const clientFile = path.join(temporary, 'pending-owner-client.js');
	await bundlePendingOwner(client, 'client', clientFile, temporary);
	const server = path.join(temporary, 'pending-owner-server.mjs');
	await writeFile(
		server,
		`import {renderToHydratableString} from '@exactjs/ssr/enhanced';
import {pendingOwnerRoot} from ${JSON.stringify(artifact(fixture).serverFile)};
import {corpus} from ${JSON.stringify(artifact(tone).serverFile)};
export async function pendingOwnerResponse(request){const url=new URL(request.url);if(url.pathname==='/pending-owner-client.js')return new Response(${JSON.stringify(await readFile(clientFile, 'utf8'))},{headers:{'content-type':'text/javascript'}});
if(url.pathname==='/pending-owner-state'){const result=await renderToHydratableString(pendingOwnerRoot({id:url.searchParams.get('id')??'first',label:url.searchParams.get('label')??undefined,enhanced:url.searchParams.get('enhanced')==='true',wait:async()=>{},removed:()=>{}}),{enhancementCatalog:new Map([['../scenarios/enhancement-routing.fixtures.js#corpus',corpus]])});return Response.json({html:result.html,resumptions:result.resumptions});}
return new Response('<!doctype html><body>',{headers:{'content-type':'text/html'}});}`
	);
	const bundled = path.join(temporary, 'pending-owner-server-bundle.mjs');
	await bundlePendingOwner(server, 'server', bundled, temporary);
	return bundled;
}

/** Runs the existing observable mount/hydration contract in a fresh browser page for every cell. */
export async function checkPendingOwners(origin, browser) {
	for (const entry of ['mount', 'hydrate'])
		for (const enhanced of [false, true]) {
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			try {
				await page.goto(new URL('/pending-owner', origin).href);
				await page.evaluate(
					async ([entry, enhanced]) => {
						const module = await import('/pending-owner-client.js');
						await module.verify(entry, enhanced);
						for (const seed of [17, 99]) await module.sequence(entry, enhanced, seed);
					},
					[entry, enhanced]
				);
				assert.deepEqual(errors, [], `${entry}/enhanced=${enhanced}`);
			} finally {
				await page.close();
			}
		}
}

async function bundlePendingOwner(entry, target, output, root) {
	const require = createRequire(
		new URL('../../framework-adapters/vite-plugin/package.json', import.meta.url)
	);
	const { build } = await import(pathToFileURL(require.resolve('vite')).href);
	const { exact } = await import('../../framework-adapters/vite-plugin/dist/index.js');
	const result = await build({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [
			exact({ applicationRoot: root, target, serverComponents: true, reactCompatibility: false })
		],
		build: {
			write: false,
			minify: false,
			ssr: target === 'server' ? entry : false,
			lib: { entry, formats: ['es'] },
			rollupOptions: { output: { inlineDynamicImports: true } }
		},
		ssr: { noExternal: true }
	});
	const chunks = (Array.isArray(result) ? result : [result]).flatMap((value) => value.output);
	const chunk = chunks.find((value) => value.type === 'chunk' && value.isEntry);
	assert.ok(chunk, 'Missing pending owner bundle');
	await writeFile(output, chunk.code);
}
