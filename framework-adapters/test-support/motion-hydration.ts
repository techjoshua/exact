import { appendFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
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
	'continuation-shell-stream',
	'wrapper-transparent-shell',
	'wrapper-transparent-shell-stream',
	'wrapper-intrinsic-shell',
	'wrapper-intrinsic-shell-stream',
	'wrapper-fragment-shell',
	'wrapper-fragment-shell-stream'
] as const;

/** Prepares the same SSR/hydration contract for each adapter; caller owns dispose(). */
export async function createMotionHydrationFixture(mode: (typeof motionHydrationModes)[number]) {
	// A document wrapper must not turn a server-only parent into the owner of its islands.
	// Client-capable roots still adopt their subtree, even with partitioned paired artifacts.
	const shell = mode.includes('shell');
	const continuation = mode.startsWith('continuation');
	const wrapper = mode.startsWith('wrapper-');
	const transparent = mode.includes('transparent');
	const fragment = mode.includes('fragment');
	const wrapperStart = fragment
		? '<>'
		: `<${transparent ? '_' : 'article'} theme:scope theme:appearance={this.state.value % 2 ? 'light' : 'dark'} theme:contrast="standard" theme:motion="full" theme:typography={{body:'serif', baseSizeRem:this.state.value % 2 ? 1 : 1.125}}>`;
	const forwardedChildren = fragment
		? '{props[String("children")] ?? null}'
		: transparent
			? '{props[String("children")] || null}'
			: '{props[String("children")] === props.children ? props[String("children")] : null}';
	const wrapperEnd = fragment ? '</>' : `</${transparent ? '_' : 'article'}>`;
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
import { TaskContext, type Child, type Component } from '@exactjs/core';
${wrapper ? `import { _ } from '@exactjs/jsx'; import * as theme from '@exactjs/theme/enhancements' with {type:'exact-enhancement'};` : ''}
import motion from '${mode === 'absent' ? '@fixture/motion' : '@exactjs/motion'}' with { type: 'exact-enhancement' };
import { fade } from '@exactjs/motion/presets';
export function Counter(this: Component<{ value: number }>${wrapper ? ', props: { [key: string]: Child; "button-label": string }' : ''}) {
 this.state.value = 7;
 ${continuation ? 'const increment = async (_task: TaskContext = TaskContext.server()) => { this.state.value += 1; };' : ''}
 return () => ${wrapper ? wrapperStart : '<article>'}<button onClick={() => ${continuation ? 'increment()' : 'this.state.value++'}}>${wrapper ? '{props["button-label"]}' : 'Add'} {this.state.value}</button><strong motion:change={fade.enter}>{this.state.value}</strong><p motion:apply={fade}>panel</p><ul motion:change={fade.enter}><li>finding</li></ul>${wrapper ? (fragment ? '' : '<_ theme:scope theme:appearance="inverse" theme:typography={{display:"monospace"}}><span data-inverse>Inverse</span></_>') + '<span data-dynamic>{props[String("dynamic-label")]}</span>' + forwardedChildren + wrapperEnd : '</article>'};
}
${
	wrapper
		? `export function NestedCounter(this: Component<{ value: number }>) {
 this.state.value = 0;
 const increment = async (_task: TaskContext = TaskContext.server()) => { this.state.value += 1; };
 return () => <button data-nested onClick={() => increment()}>Nested {this.state.value}</button>;
}
export function EmptyWrapper(this: Component<{value:number}>, props: {children?:Child; kind:string}) {
 this.state.value = 0;
 return () => <section data-child-kind={props.kind}><button data-empty onClick={() => this.state.value++}>Empty {this.state.value}</button><output data-empty-status>{props.children === undefined ? 'undefined' : props.children === null ? 'null' : String(props.children)} {this.state.value}</output>{props.children}</section>;
}`
		: ''
}
${
	mode.includes('server-shell') || continuation || wrapper
		? mode.startsWith('declared-') || continuation || wrapper
			? `/** @exact server */
export function Page() { return () => <section><Counter ${wrapper ? 'button-label="Add" dynamic-label="Dynamic"' : ''}>${wrapper ? '<aside data-server-content="retained"><input value="Server content" /><NestedCounter /></aside>' : ''}</Counter>${wrapper ? '<EmptyWrapper kind="undefined" /><EmptyWrapper kind="null-child" children={null} /><EmptyWrapper kind="false" children={false} /><EmptyWrapper kind="zero" children={0} /><EmptyWrapper kind="text" children="Text" />' : ''}</section>; }`
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
		const hydrationOptions =
			continuation || wrapper ? '...createExactHydrationConfig(contract),' : '';
		const serverTransport =
			continuation || wrapper
				? `import { ${wrapper ? 'NestedCounter' : 'Counter'} } from '${page('server')}'; import { composeExactExecutorContract, createExactHydrationConfig, createFetchHandler } from '@exactjs/server'; import { createExactServerRuntime } from '@exactjs/ssr'; const contract = composeExactExecutorContract([${wrapper ? 'NestedCounter' : 'Counter'}], { endpoint: '/__exact' }); export const handleExact = createFetchHandler(createExactServerRuntime({contract, patchStrategy:'element'}));`
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
		await appendFile(
			path.join(root, 'server.tsx'),
			`\nexport const wrapperKind = ${JSON.stringify(wrapper ? (fragment ? 'fragment' : transparent ? 'transparent' : 'intrinsic') : null)};`
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
