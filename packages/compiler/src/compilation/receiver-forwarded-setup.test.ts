/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

it.each(['without indexed state', 'with indexed state'] as const)(
	'renders forwarded setup with the receiving component state and props %s',
	async (layout) => {
		const root = await createCompilerTestWorkspace('.exact-forwarded-setup-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import type {Component} from '@exactjs/core';
type State = { count: number; alternate?: boolean };
type Props = { value: string };
function setup(this: Component<State>, props: Props, initial: number) {
	this.state.count = initial;
	this.onMount(() => { this.state.count++; });
	return () => <label>{props.value}:{this.state.count}</label>;
}
export function Input(this: Component<State>, props: Props) {
	${layout === 'with indexed state' ? 'this.state.alternate = true;' : ''}
	return setup.call(this, props, 1);
}`,
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					strict: true,
					jsx: 'preserve',
					jsxImportSource: '@exactjs/jsx',
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler'
				}
			})
		});
		const artifacts = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const page = artifacts.find((entry) => entry.inputFile === files['page.tsx'])!;
		const server = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
		const client = await importArtifact(page.clientFile, path.join(root, 'client.mjs'));
		const input = (component: unknown, value: string) =>
			createCompiledComponentInputReceipt(component as AnyComponentFunction, { value });
		const rendered = await renderToHydratableString(input(server.Input, 'first'));
		const container = document.createElement('div');
		container.innerHTML = rendered.htmlWithHydration;
		const original = container.querySelector('label');
		expect(original?.textContent).toBe('first:1');
		const adopted = hydrate(input(client.Input, 'first'), container, { onMismatch: 'throw' });
		onTestFinished(() => adopted.dispose());
		flushSync();
		expect(container.querySelector('label')).toBe(original);
		expect(original?.textContent).toBe('first:2');

		const fresh = document.createElement('div');
		onTestFinished(() => {
			unmount(fresh);
		});
		render(input(client.Input, 'first'), fresh);
		flushSync();
		const label = fresh.querySelector('label');
		expect(label?.textContent).toBe('first:2');
		render(input(client.Input, 'second'), fresh);
		flushSync();
		expect(fresh.querySelector('label')).toBe(label);
		expect(label?.textContent).toBe('second:2');
	}
);
