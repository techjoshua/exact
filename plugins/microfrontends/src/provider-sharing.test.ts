import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { build, type Plugin } from 'vite';
import * as reactive from '@exactjs/reactive';
import * as objects from '@exactjs/reactive/framework/objects';
import { createExactRemoteArtifactPlan } from './build.js';
import { createExactRemoteRollupAdapter, type ExactRollupOutput } from './rollup.js';

it('keeps specialized remote state in the host reactive dependency graph', async () => {
	const root = await mkdtemp(path.resolve('.exact-provider-sharing-'));
	const symbol = Symbol.for('@exactjs/provided-packages');
	const globals = globalThis as Record<PropertyKey, unknown>;
	const previous = globals[symbol];
	try {
		await writeFile(path.join(root, 'page.js'), 'export const page = true;');
		await writeFile(
			path.join(root, 'Area.js'),
			`import { watch, flushSync } from '@exactjs/reactive';
import { reactiveObjects } from '@exactjs/reactive/framework/objects';
export default function journey() {
  const state = reactiveObjects({ count: 1 });
  const seen = [];
  const stop = watch(() => seen.push(state.count));
  state.count = 2;
  flushSync();
  stop();
  state.count = 3;
  flushSync();
  return seen;
}`
		);
		const plan = createExactRemoteArtifactPlan(
			{ exposes: { './Area': { component: './Area.js' } }, remotes: {}, providedPackages: [] },
			{ packageName: '@probe/remote', buildKey: '0123456789abcdef0123456789abcdef01234567' }
		);
		let entry: string | undefined;
		const adapter = createExactRemoteRollupAdapter({
			plan,
			applicationRoot: root,
			registrationModules: { './Area': 'export const exactHydrationRegistration = {};' },
			onEntries: (entries) => {
				entry = entries['./Area'];
			}
		});
		const plugin: Plugin = {
			name: 'exact-provider-sharing',
			enforce: 'pre',
			buildStart() {
				adapter.buildStart(this);
			},
			transform(code, id) {
				adapter.recordModule(code, id);
			},
			resolveId(source, importer) {
				return adapter.resolveId(source, importer, (request, owner) =>
					this.resolve(request, owner, { skipSelf: true })
				);
			},
			load(id) {
				return adapter.load(id);
			},
			generateBundle(_options, bundle) {
				adapter.generateBundle(bundle as unknown as Readonly<Record<string, ExactRollupOutput>>);
			}
		};
		await build({
			root,
			logLevel: 'silent',
			plugins: [plugin],
			build: { outDir: 'dist', rollupOptions: { input: path.join(root, 'page.js') } }
		});
		globals[symbol] = {
			require(key: string) {
				if (key === '@exactjs/reactive') return reactive;
				if (key === '@exactjs/reactive/framework/objects') return objects;
				throw new Error(`Unexpected provider ${key}`);
			}
		};
		expect(entry).toBeDefined();
		const remote = await import(
			/* @vite-ignore */ pathToFileURL(path.join(root, 'dist', entry!)).href
		);
		expect(remote.default.component()).toEqual([1, 2]);
	} finally {
		if (previous === undefined) delete globals[symbol];
		else globals[symbol] = previous;
		await rm(root, { recursive: true, force: true });
	}
});
