import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const result = await build({
	absWorkingDir: repositoryRoot,
	stdin: {
		contents: `
			import { render } from './packages/dom/src/public.ts';
			import { createCompiledIntrinsicReceipt } from './packages/core/src/runtime/component-abi.ts';
			export function mountNativeFixture(container) {
				render(createCompiledIntrinsicReceipt('main', null, 'native'), container);
			}
		`,
		resolveDir: repositoryRoot,
		sourcefile: 'component-local-target-abi-native-fixture.ts',
		loader: 'ts'
	},
	bundle: true,
	write: false,
	metafile: true,
	format: 'esm',
	platform: 'browser',
	target: 'es2022',
	treeShaking: true,
	tsconfig: path.join(repositoryRoot, 'tsconfig.json')
});

const forbidden = [
	/packages\/core\/src\/vnode\.ts$/,
	/packages\/core\/src\/component-abi\/vnode-link\.ts$/,
	/packages\/dom\/src\/children\.ts$/,
	/packages\/dom\/src\/mounted-vnode\.ts$/,
	/packages\/dom\/src\/renderer\/mounting\/root\.ts$/,
	/packages\/dom\/src\/renderer\/mounting\/component-artifact\.ts$/,
	/packages\/dom\/src\/renderer\/patching\/root\.ts$/,
	/packages\/dom\/src\/renderer\/patching\/vnode-children\.ts$/,
	/packages\/dom\/src\/runtime\/compatibility-vnodes\.ts$/
];
const outputInputs = Object.values(result.metafile.outputs).flatMap((output) =>
	Object.entries(output.inputs).map(([input, contribution]) => ({
		input: input.replaceAll('\\', '/'),
		bytes: contribution.bytesInOutput
	}))
);
const inputs = Object.keys(result.metafile.inputs).map((input) => input.replaceAll('\\', '/'));
const violations = outputInputs.filter(
	({ input, bytes }) => bytes > 0 && forbidden.some((pattern) => pattern.test(input))
);
if (violations.length)
	throw new Error(
		`Native DOM fixture emits forbidden compatibility modules:\n${violations
			.map(
				({ input, bytes }) =>
					`${input} (${bytes} bytes)\n  ${importPath(result.metafile, input).join(' -> ')}`
			)
			.join('\n')}`
	);
console.log(`native DOM reachability ok (${inputs.length} source modules)`);

const ssrResult = await build({
	absWorkingDir: repositoryRoot,
	stdin: {
		contents: `
			export { renderCompilerClosedToStringAsync } from './packages/ssr/src/compiler-closed.ts';
		`,
		resolveDir: repositoryRoot,
		sourcefile: 'component-local-target-abi-native-ssr-fixture.ts',
		loader: 'ts'
	},
	bundle: true,
	write: false,
	metafile: true,
	format: 'esm',
	platform: 'node',
	target: 'node22',
	treeShaking: true,
	tsconfig: path.join(repositoryRoot, 'tsconfig.json')
});
const ssrForbidden = [
	/packages\/core\/src\/vnode\.ts$/,
	/packages\/core\/src\/component-abi\/vnode-link\.ts$/,
	/packages\/ssr\/src\/render\/sync-tree\.ts$/,
	/packages\/ssr\/src\/render\/async-tree\.ts$/,
	/packages\/ssr\/src\/render\/generic-component-(sync|async)\.ts$/,
	/packages\/ssr\/src\/runtime\/(generic|compatibility)-components\.ts$/
];
const ssrOutputInputs = Object.values(ssrResult.metafile.outputs).flatMap((output) =>
	Object.entries(output.inputs).map(([input, contribution]) => ({
		input: input.replaceAll('\\', '/'),
		bytes: contribution.bytesInOutput
	}))
);
const ssrViolations = ssrOutputInputs.filter(
	({ input, bytes }) => bytes > 0 && ssrForbidden.some((pattern) => pattern.test(input))
);
if (ssrViolations.length)
	throw new Error(
		`Native SSR fixture emits forbidden compatibility modules:\n${ssrViolations
			.map(({ input, bytes }) => `${input} (${bytes} bytes)`)
			.join('\n')}`
	);
console.log(
	`native SSR reachability ok (${Object.keys(ssrResult.metafile.inputs).length} source modules)`
);

function importPath(metafile, target) {
	const entries = Object.keys(metafile.inputs);
	const start = entries.find((input) =>
		input.endsWith('component-local-target-abi-native-fixture.ts')
	);
	if (!start) return [];
	const queue = [[start]];
	const seen = new Set([start]);
	while (queue.length) {
		const path = queue.shift();
		const current = path.at(-1);
		if (current.replaceAll('\\', '/') === target) return path;
		for (const imported of metafile.inputs[current]?.imports ?? []) {
			if (!metafile.inputs[imported.path] || seen.has(imported.path)) continue;
			seen.add(imported.path);
			queue.push([...path, imported.path]);
		}
	}
	return [];
}
