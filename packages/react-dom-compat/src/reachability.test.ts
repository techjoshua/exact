import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { transform } from '../../compiler/src/index.js';

async function bundledInputs(source: string, compile = false): Promise<string[]> {
	const contents = compile
		? transform(source, {
				filename: 'component-local-target-abi-reachability.tsx',
				target: 'client'
			})
		: source;
	const result = await build({
		stdin: {
			contents,
			resolveDir: process.cwd(),
			sourcefile: `component-local-target-abi-reachability.${compile ? 'ts' : 'js'}`,
			loader: compile ? 'ts' : 'js'
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		metafile: true,
		conditions: ['browser', 'exact-client']
	});
	return Object.keys(result.metafile.inputs).map((filename) => filename.replaceAll('\\', '/'));
}

describe('React compatibility bundle reachability', () => {
	it('keeps every React compatibility module out of a native-only application', async () => {
		const inputs = await bundledInputs(
			`
			import { render } from '@exactjs/dom';
			export function NativeView() { return () => <p>native</p>; }
			export function mount(container: Element) { render(<NativeView />, container); }
		`,
			true
		);

		expect(inputs.some((filename) => filename.includes('/react-compat/'))).toBe(false);
		expect(inputs.some((filename) => filename.includes('/react-dom-compat/'))).toBe(false);
	});

	it('uses fixed island and root artifacts without runtime artifact factories', async () => {
		const inputs = await bundledInputs(`
			import { createElement } from '@exactjs/react-compat';
			import { createRoot } from '@exactjs/react-dom-compat/client';
			export function mount(container, View) { createRoot(container).render(createElement(View)); }
		`);
		const inventory = inputs.join('\n');

		expect(inventory).toContain('/react-compat/dist/runtime/island-artifacts.js');
		expect(inventory).toContain('/react-dom-compat/dist/renderer/root.js');
		expect(inventory).not.toContain('/react-compat/dist/runtime/adapter-cache.js');
	});
});
