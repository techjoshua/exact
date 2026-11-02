import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startInstalledIslandsHttp } from '../../framework-adapters/test-support/installed-islands-http.mjs';

/** Runs the unchanged compiled fixture in a real browser with retained browser-target runtime providers. */
export async function checkSharedCompositionBrowser(root, browser) {
	const { compileProjectArtifacts, createCompilerSession } = await import('@exactjs/compiler');
	const { build } = await import('esbuild');
	const engine = browser.browserType().name();
	await mkdir(path.join(root, '.tmp'), { recursive: true });
	const temporary = await mkdtemp(path.join(root, '.tmp/shared-composition-browser-'));
	let session;
	let deployment;
	let page;
	try {
		const fixture = path.join(
			root,
			'packages/compiler/src/test-support/shared-composition.fixtures.tsx'
		);
		const source = await readFile(fixture, 'utf8');
		const entry = path.join(temporary, 'page.tsx');
		await writeFile(entry, source);
		await writeFile(
			path.join(temporary, 'tsconfig.json'),
			JSON.stringify({
				extends: path.join(root, 'packages/compiler/tsconfig.json'),
				files: [],
				include: []
			})
		);
		session = createCompilerSession();
		const artifacts = await compileProjectArtifacts([entry], {
			rootDir: temporary,
			outDir: path.join(temporary, 'generated'),
			session
		});
		const artifact = artifacts.find((candidate) => candidate.inputFile === entry);
		assert.ok(artifact, 'Missing shared composition artifact');
		const client = path.join(temporary, 'client-entry.mjs');
		const journey = path.join(
			root,
			'packages/component-composition-corpus/test-support/shared-composition-journey.mjs'
		);
		await writeFile(
			client,
			`
import '@exactjs/core/runtime/contexts';
import '@exactjs/core/runtime/component-reactivity';
import '@exactjs/core/runtime/component-tasks';
import '@exactjs/core/runtime/lifecycle';
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/localization';
import '@exactjs/core/runtime/logging';
import '@exactjs/core/runtime/refs';
import {SharedComposition} from ${JSON.stringify(artifact.clientFile)};
import {testComponent} from '@exactjs/testing';
import {createErrorContext,ErrorContext} from '@exactjs/core';
import {verifySharedComposition} from ${JSON.stringify(journey)};
export function verify(){return verifySharedComposition({SharedComposition,testComponent,createErrorContext,ErrorContext});}
`
		);
		const bundle = await build({
			entryPoints: [client],
			bundle: true,
			platform: 'browser',
			format: 'esm',
			write: false,
			logLevel: 'silent'
		});
		deployment = await startInstalledIslandsHttp(
			{
				async renderPage() {
					return {
						htmlWithHydration:
							'<!doctype html><html><head><link rel="icon" href="data:,"></head><body></body></html>'
					};
				},
				async handleExact() {
					return new Response('Not found', { status: 404 });
				}
			},
			bundle.outputFiles[0].text
		);
		page = await browser.newPage();
		const faults = [];
		page.on('pageerror', (error) => faults.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') faults.push(message.text());
		});
		await page.goto(deployment.origin);
		const result = await page.evaluate(async () => {
			const { verify } = await import('/client.mjs');
			return verify();
		});
		assert.deepEqual(faults, [], 'Unexpected ' + engine + ' reports');
		assert.deepEqual(deployment.errors, [], 'Unexpected HTTP host errors');
		return {
			id: 'shared-composition-' + engine + '-mount',
			engine,
			status: 'verified',
			browser: browser.version(),
			fixtureSHA256: createHash('sha256').update(source).digest('hex'),
			fixtureUnchanged: source === (await readFile(entry, 'utf8')),
			...result,
			scope:
				'Current compiled component with retained browser runtime providers. Provider build provenance unverified. No fresh Core, installed framework, hydration or runtime matrix acceptance.'
		};
	} finally {
		try {
			await page?.close();
		} finally {
			try {
				await deployment?.dispose();
			} finally {
				try {
					session?.dispose();
				} finally {
					await rm(temporary, { recursive: true, force: true });
				}
			}
		}
	}
}
