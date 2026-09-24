import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '@exactjs/compiler';

/** Shared source/artifact and shell modes for each supported build adapter. */
export const motionHydrationModes = [
	'authored',
	'paired',
	'facade',
	'absent',
	'partitioned',
	'partitioned-stream',
	'server-shell',
	'server-shell-stream',
	'declared-server-shell',
	'declared-server-shell-stream',
	'client-shell',
	'client-shell-stream',
	'continuation-shell',
	'continuation-shell-stream'
] as const;

/** Prepares the same SSR/hydration contract for each adapter; caller owns dispose(). */
export async function createMotionHydrationFixture(mode: (typeof motionHydrationModes)[number]) {
	// A document wrapper must not turn a server-only parent into the owner of its islands.
	// Client-capable roots still adopt their subtree, even with partitioned paired artifacts.
	const shell = mode.includes('shell');
	const continuation = mode.startsWith('continuation');
	const partitioned = mode.startsWith('partitioned') || shell;
	await mkdir(path.resolve('.tmp'), { recursive: true });
	const root = await mkdtemp(path.resolve('.tmp/motion-ssr-'));
	const dispose = () => rm(root, { recursive: true, force: true });
	try {
		await mkdir(path.join(root, 'out'));
		if (mode === 'absent') {
			await mkdir(path.join(root, 'node_modules/@fixture'), { recursive: true });
			await symlink(
				fileURLToPath(new URL('../../component-libraries/motion', import.meta.url)),
				path.join(root, 'node_modules/@fixture/motion'),
				'junction'
			);
		}

		await writeFile(
			path.join(root, 'page.tsx'),
			`
import { TaskContext, type Component } from '@exactjs/core';
import motion from '${mode === 'absent' ? '@fixture/motion' : '@exactjs/motion'}' with { type: 'exact-enhancement' };
import { fade } from '@exactjs/motion/presets';
export function Counter(this: Component<{ value: number }>) {
 this.state.value = 7;
 ${continuation ? 'const increment = async (_task: TaskContext = TaskContext.server()) => { this.state.value += 1; };' : ''}
 return () => <article><button onClick={() => ${continuation ? 'increment()' : 'this.state.value++'}}>Add {this.state.value}</button><strong motion:change={fade.enter}>{this.state.value}</strong><p motion:apply={fade}>panel</p><ul motion:change={fade.enter}><li>finding</li></ul></article>;
}
${
	mode.includes('server-shell') || continuation
		? mode.startsWith('declared-') || continuation
			? `/** @exact server */
export function Page() { return () => <section><Counter /></section>; }`
			: `export function Page(this: Component<{ ready: boolean }>) {
 const prepare = (_task: TaskContext = TaskContext.server().blocking()) => { this.state.ready = true; };
 prepare();
 return () => <section data-ready={this.state.ready}><Counter /></section>;
}`
		: 'export { Counter as Page };'
}
`
		);
		if (mode !== 'authored') {
			const options = {
				rootDir: root,
				outDir: path.join(root, 'generated'),
				sourceMap: mode === 'paired',
				serverComponents: partitioned
			};
			let artifacts: Awaited<ReturnType<typeof compileProjectArtifacts>>;
			if (mode === 'absent') {
				// Model a separate producer installation, avoiding Node's stale package-resolution caches.
				const producer = path.join(root, 'compile.mjs');
				const compiler = pathToFileURL(
					fileURLToPath(new URL('../../packages/compiler/dist/index.js', import.meta.url))
				).href;
				await writeFile(
					producer,
					`import { compileProjectArtifacts } from ${JSON.stringify(compiler)}; await compileProjectArtifacts([${JSON.stringify(path.join(root, 'page.tsx'))}], ${JSON.stringify(options)});`
				);
				await promisify(execFile)(process.execPath, [producer], { timeout: 30_000 });
				artifacts = [];
			} else artifacts = await compileProjectArtifacts([path.join(root, 'page.tsx')], options);
			if (partitioned) {
				const graph = createExactArtifactGraph(artifacts, {
					packageRoot: root,
					sourceRoot: root,
					rootDir: path.join(root, 'generated')
				});
				await writeFile(
					path.join(root, 'generated/registration.ts'),
					createExactHydrationRegistrationModule(graph)
				);
			}
		}
		if (mode === 'absent') await rm(path.join(root, 'node_modules/@fixture/motion'));
		const page = (target: string) =>
			mode === 'authored'
				? './page.js'
				: mode === 'facade'
					? './generated/page.exact'
					: `./generated/page.exact.${target}.ts`;
		const hydrationOptions = continuation ? '...createExactHydrationConfig(contract),' : '';
		const serverTransport = continuation
			? `import { Counter } from '${page('server')}'; import { composeExactExecutorContract, createExactHydrationConfig, createFetchHandler } from '@exactjs/server'; import { createExactServerRuntime } from '@exactjs/ssr'; const contract = composeExactExecutorContract([Counter], { endpoint: '/__exact' }); export const handleExact = createFetchHandler(createExactServerRuntime({contract, patchStrategy:'element'}));`
			: '';
		const shellOptions = shell
			? `, {${hydrationOptions}documentShell: application => <Document><html><head><title>Shell</title></head><body><main id="app">{application}</main></body></html></Document>}`
			: '';
		await writeFile(
			path.join(root, 'server.tsx'),
			mode.endsWith('stream')
				? `${serverTransport} import {Page} from '${page('server')}'; import {Document} from '@exactjs/core/document'; import {renderToHydratableProgressiveHtmlStream} from '@exactjs/ssr'; export const renderPage = async () => { let htmlWithHydration = ''; for await (const chunk of renderToHydratableProgressiveHtmlStream(<Page/>${shellOptions})) htmlWithHydration += chunk; return {htmlWithHydration}; };`
				: `${serverTransport} import {Page} from '${page('server')}'; import {Document} from '@exactjs/core/document'; import {renderToHydratableString} from '@exactjs/ssr'; export const renderPage = () => renderToHydratableString(<Page/>${shellOptions});`
		);
		await writeFile(
			path.join(root, 'client.tsx'),
			partitioned && !mode.startsWith('client-shell')
				? `import {exactHydrationRegistration} from './generated/registration.js'; import {createExactClient, readExactHydrationConfig} from '@exactjs/hydrate'; export const mountPage = (root: Element, options = {}) => createExactClient(root, {...readExactHydrationConfig(root), ...exactHydrationRegistration, ...options});`
				: `import {Page} from '${page('client')}'; import {hydrate} from '@exactjs/hydrate'; export const mountPage = (root: Element) => hydrate(<Page/>, root);`
		);
		return { root, shell, partitioned, dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}
