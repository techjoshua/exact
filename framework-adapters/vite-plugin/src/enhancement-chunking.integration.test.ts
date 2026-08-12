import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type OutputChunk, type RollupOutput } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';

it('keeps the enhancement host with a later-loaded enhancement module', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-vite-enhancement-chunking-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, 'src');
	const exactScope = path.join(root, 'node_modules', '@exactjs');
	mkdirSync(source, { recursive: true });
	mkdirSync(exactScope, { recursive: true });
	const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
	for (const packageName of ['core', 'dom', 'jsx', 'reactive'])
		symlinkSync(
			path.join(repositoryRoot, 'packages', packageName),
			path.join(exactScope, packageName),
			'junction'
		);
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({ name: 'exact-enhancement-chunking-fixture', private: true, type: 'module' })
	);
	writeFileSync(
		path.join(root, 'index.html'),
		'<main id="app"></main><script type="module" src="/src/main.tsx"></script>'
	);
	writeFileSync(
		path.join(source, 'main.tsx'),
		`import { render } from '@exactjs/dom';
render(<p>Host</p>, document.querySelector('#app'));
globalThis.loadExactEnhancementFixture = () => import('./lazy.js');
`
	);
	writeFileSync(
		path.join(source, 'lazy.tsx'),
		`import motion from './motion.js' with { type: 'exact-enhancement' };
export function LazyPanel() { return () => <button motion:preset="fade">Lazy</button>; }
`
	);
	writeFileSync(
		path.join(source, 'motion.ts'),
		`export { default } from './motion-implementation.js' with { type: 'exact-enhancement' };
`
	);
	writeFileSync(
		path.join(source, 'motion-implementation.tsx'),
		`export default function Motion(props: { preset?: string; children?: unknown }) { return () => <aside data-motion={props.preset}>{props.children}</aside>; }
`
	);

	const result = (await build({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [exact({ applicationRoot: root, reactCompatibility: false })],
		build: { write: false, minify: false }
	})) as RollupOutput;
	const chunks = new Map(
		result.output
			.filter((output): output is OutputChunk => output.type === 'chunk')
			.map((chunk) => [chunk.fileName, chunk])
	);
	const entry = [...chunks.values()].find((chunk) => chunk.isEntry)!;
	const entryModules = reachableModules(entry, chunks, false);
	const allModules = reachableModules(entry, chunks, true);
	const enhancementHost = /[\\/]packages[\\/]dom[\\/]dist[\\/]renderer[\\/]enhancements\.js$/u;

	expect([...entryModules].some((id) => enhancementHost.test(id))).toBe(false);
	expect([...allModules].some((id) => enhancementHost.test(id))).toBe(true);
});

function reachableModules(
	entry: OutputChunk,
	chunks: ReadonlyMap<string, OutputChunk>,
	includeDynamic: boolean
): Set<string> {
	const modules = new Set<string>();
	const visited = new Set<string>();
	const visit = (chunk: OutputChunk): void => {
		if (visited.has(chunk.fileName)) return;
		visited.add(chunk.fileName);
		for (const id of Object.keys(chunk.modules)) modules.add(id);
		for (const imported of chunk.imports) {
			const dependency = chunks.get(imported);
			if (dependency) visit(dependency);
		}
		if (includeDynamic)
			for (const imported of chunk.dynamicImports) {
				const dependency = chunks.get(imported);
				if (dependency) visit(dependency);
			}
	};
	visit(entry);
	return modules;
}
