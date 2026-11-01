import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

/** Authored root callbacks may annotate context aliases without changing private plugin selection. */
export const pluginConfigurationObservationSource = `
context.executionIndex = 900;
context.plugin.packageName = 'observed-plugin';
context.contributor.packageName = 'observed-contributor';
context.provenance.activationPaths[0]?.push('observed-path');
context.provenance.orderingAfter.push('observed-order');
`;

/** Remote source that crosses the public watcher and compiler-specialized state provider. */
export const microfrontendProviderJourneySource = `
import { /* preserve the page observer graph */ watch } from '@exactjs/reactive';
import { flushSync } from '@exactjs/reactive';
import * as State from '@exactjs/reactive';
import { reactiveObjects } from '@exactjs/reactive/framework/objects';
import { loadExactRemoteModule, registerExactRemoteClientBindings, createExactBindingGateway } from '@exactjs/microfrontends';
export function providerJourney() {
 if(typeof createExactBindingGateway !== 'function' || typeof createExactBindingGateway({bindings:{}}).forward !== 'function') throw new Error('Web API gateway export failed');
 if(typeof loadExactRemoteModule !== 'function' || typeof registerExactRemoteClientBindings !== 'function') throw new Error('Browser runtime root failed');
  function local(State) { return State; }
  const unrelated = { State: 1 };
  if (local(unrelated.State) !== 1) throw new Error('Local namespace control failed');
  const state = reactiveObjects({ count: 1 });
  const seen = [];
  const stop = watch(() => seen.push(state.count));
  state.count = 2;
  State['flushSync']();
  stop();
  state.count = 3;
  flushSync();
  return seen;
}
`;

/** Writes a remote fixture with shared provider state, lazy code, styles, and an emitted asset. */
export async function writeMicrofrontendProviderFixture(directory: string): Promise<void> {
	await Promise.all(
		Object.entries({
			'provider-journey.js': microfrontendProviderJourneySource,
			'Area.tsx': `import './Area.css';
import icon from './icon.svg';
import { providerJourney } from './provider-journey.js';
export default function Area() {
  const load = () => import('./lazy');
  return () => <section data-icon={icon} onClick={load}>remote area</section>;
}


Area.providerJourney = providerJourney;`,
			'Area.css': '.remote-area { color: teal; }',
			'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
			'lazy.ts': 'export const lazyValue = "lazy";',
			'assets.d.ts':
				'declare module "*.css"; declare module "*.svg" { const url: string; export default url; }'
		}).map(([filename, source]) => writeFile(path.join(directory, filename), source))
	);
}

/** Checks that an unbound producer page does not acquire the host provider bootstrap. */
export async function verifyMicrofrontendProducerPage(directory: string): Promise<void> {
	const files = await readdir(directory, { recursive: true });
	const programs = await Promise.all(
		files
			.filter((file) => /\.[cm]?js$/.test(file))
			.map((file) => readFile(path.join(directory, file), 'utf8'))
	);
	const page = programs.find((source) => source.includes('__ordinaryRemoteProducerPage'));
	assert.ok(page, 'The producer page must execute its ordinary application entry');
	assert.ok(
		!page.includes('@exactjs/provided-packages'),
		'An unbound producer page must omit the provider bootstrap'
	);
}

/** Loads a real remote artifact against page-owned package instances and checks update cleanup. */
export function verifyMicrofrontendProviderJourney(
	repositoryRoot: string,
	remoteEntry: string,
	outputRoot = path.dirname(path.resolve(remoteEntry))
): void {
	const execution = spawnSync(
		process.versions.bun ? 'node' : process.execPath,
		[
			'--conditions=browser',
			'--input-type=module',
			'-e',
			`import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {registerHooks} from 'node:module';
import {allProvidedPackageKeys} from '@exactjs/microfrontends/plugin-config';
registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('/assets/'))
    return nextResolve(pathToFileURL(path.join(${JSON.stringify(path.resolve(outputRoot))}, specifier.slice('/assets/'.length))).href, context);
  return nextResolve(specifier, context);
}});
const modules = new Map();
for (const key of allProvidedPackageKeys([])) modules.set(key, await import(key));
globalThis[Symbol.for('@exactjs/provided-packages')] = {
  require(key) { assert.ok(modules.has(key), 'Missing provider '+key); return modules.get(key); }
};
let published;
globalThis[Symbol.for('@exactjs/microfrontends/remote-loader')] = {publish(_token, module) {published = module;}};
const remote = await import(pathToFileURL(${JSON.stringify(path.resolve(remoteEntry))}));
assert.deepEqual((remote.default ?? published).component.providerJourney(), [1,2]);`
		],
		{ cwd: repositoryRoot, encoding: 'utf8', timeout: 30_000 }
	);
	if (execution.status !== 0)
		throw new Error(
			execution.error?.message ?? execution.stderr ?? 'Remote provider journey failed'
		);
}
