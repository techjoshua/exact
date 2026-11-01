import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createExactRemoteArtifactPlan } from '@exactjs/microfrontends/build';
import { createExactRemoteBunAdapter } from '@exactjs/microfrontends/bun';
import { ExactBunMicrofrontendIntegration } from './microfrontends.js';
import type { BunBuildLike } from './plugin.js';

type ResolveHandler = Parameters<NonNullable<BunBuildLike['onResolve']>>[1];

it('retains provider validation failures and resolves subsequent valid imports', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-bun-provider-imports-'));
	let integration: ExactBunMicrofrontendIntegration | undefined;
	try {
		const filename = path.join(root, 'Area.js');
		const plan = createExactRemoteArtifactPlan(
			{ exposes: { './Area': { component: './Area.js' } }, remotes: {}, providedPackages: [] },
			{ packageName: '@fixture/remote', buildKey: '0123456789abcdef0123456789abcdef01234567' }
		);
		const adapter = createExactRemoteBunAdapter({
			plan,
			applicationRoot: root,
			registrationModules: { './Area': 'export const exactHydrationRegistration = {};' }
		});
		integration = new ExactBunMicrofrontendIntegration(adapter);
		const handlers: Array<{ filter: RegExp; handler: ResolveHandler }> = [];
		integration.install({
			config: {},
			onLoad() {},
			onResolve(options, handler) {
				handlers.push({ filter: options.filter, handler });
			}
		});
		await handlers
			.find(({ filter }) => filter.test(`${filename}?exact-remote-scope=area`))!
			.handler({ path: `${filename}?exact-remote-scope=area` });
		const resolve = handlers.find(({ filter }) => filter.test('@exactjs/reactive'))!.handler;
		for (const [source, message] of [
			[`import * as State from '@exactjs/reactive'; consume(State);`, 'static property access'],
			[`import('@exactjs/reactive');`, 'Dynamic imports'],
			[`import * as State from '@exactjs/reactive'; State[dynamic];`, 'static property access']
		]) {
			writeFileSync(filename, source!);
			await expect(resolve({ path: '@exactjs/reactive', importer: filename })).rejects.toThrow(
				message
			);
		}
		writeFileSync(
			filename,
			`import { /* provider comment */ watch } from '@exactjs/reactive'; import {flushSync} from '@exactjs/reactive';`
		);
		const resolved = await resolve({ path: '@exactjs/reactive', importer: filename });
		expect(resolved?.namespace).toBe(adapter.namespace);
		const bridge = adapter.onLoad(resolved!.path)!;
		expect(bridge.contents).toContain('as watch');
		expect(bridge.contents).toContain('as flushSync');
		expect(await resolve({ path: '@ordinary/uninstalled', importer: filename })).toBeUndefined();
	} finally {
		integration?.dispose();
		rmSync(root, { recursive: true, force: true });
	}
});

it('uses the build resolver for scoped packages and retains the selected physical scope', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-bun-scoped-resolution-'));
	let integration: ExactBunMicrofrontendIntegration | undefined;
	try {
		const filename = path.join(root, 'scope.js');
		writeFileSync(filename, 'export {};');
		const adapter = createExactRemoteBunAdapter({
			applicationRoot: root,
			plan: createExactRemoteArtifactPlan(
				{ exposes: {}, remotes: {}, providedPackages: [] },
				{ packageName: '@fixture/remote', buildKey: '0123456789abcdef0123456789abcdef01234567' }
			),
			registrationModules: {}
		});
		integration = new ExactBunMicrofrontendIntegration(adapter);
		const handlers: Array<{ filter: RegExp; handler: ResolveHandler }> = [];
		const requests: Array<{ request: string; directory: string }> = [];
		integration.install(
			{
				config: { target: 'browser', conditions: ['browser'] },
				onLoad() {},
				onResolve(options, handler) {
					handlers.push({ filter: options.filter, handler });
				}
			},
			async (request, options) => {
				requests.push({ request, directory: options.resolveDir });
				return { path: path.join(root, 'selected-browser.js') };
			}
		);
		await handlers
			.find(({ filter }) => filter.test(`${filename}?exact-remote-scope=area`))!
			.handler({ path: `${filename}?exact-remote-scope=area` });
		const resolve = handlers.find(({ filter }) => filter.test('@ordinary/package'))!.handler;
		expect(await resolve({ path: '@ordinary/package', importer: filename })).toEqual({
			path: path.join(root, 'selected-browser.js')
		});
		expect(requests).toEqual([{ request: '@ordinary/package', directory: root }]);
		expect(integration.includes(path.join(root, 'selected-browser.js'))).toBe(true);
	} finally {
		integration?.dispose();
		rmSync(root, { recursive: true, force: true });
	}
});

it.each(['./', '', 'absolute'])(
	'publishes hashed output identities from %s metadata keys',
	(prefix) => {
		const root = path.resolve('out');
		const adapter = createExactRemoteBunAdapter({
			applicationRoot: root,
			plan: createExactRemoteArtifactPlan(
				{ exposes: { './Area': { component: './Area.js' } }, remotes: {}, providedPackages: [] },
				{ packageName: '@fixture/remote', buildKey: '0123456789abcdef0123456789abcdef01234567' }
			),
			registrationModules: { './Area': 'export const exactHydrationRegistration = {};' }
		});
		const integration = new ExactBunMicrofrontendIntegration(adapter);
		try {
			const filename = path.join(root, '..generated', 'renamed-hash.js');
			const relative = '..generated/renamed-hash.js';
			integration.begin();
			integration.finish(
				{ config: { outdir: root }, onResolve() {}, onLoad() {} },
				{
					success: true,
					outputs: [
						{ path: filename, kind: 'entry-point' },
						{ path: path.join(root, '..generated', 'style.css') },
						{ path: path.join(root, '..generated', 'icon.svg') }
					],
					metafile: {
						outputs: {
							[prefix === 'absolute' ? filename : prefix + relative]: {
								entryPoint: adapter.entrypoints[0]
							}
						}
					}
				}
			);
			expect(adapter.acceptedGeneration()).toMatchObject({
				entries: { './Area': '/' + relative },
				resources: { css: ['..generated/style.css'], assets: ['..generated/icon.svg'] }
			});
		} finally {
			integration.dispose();
		}
	}
);
