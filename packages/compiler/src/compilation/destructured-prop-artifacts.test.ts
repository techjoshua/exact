/** @vitest-environment jsdom */
import path from 'node:path';
import ts from 'typescript';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['destructured', 'direct', 'renamed-defaults', 'imported-helper'] as const)(
	'preserves %s prop semantics across checking, SSR, hydration, and updates',
	async (mode) => {
		const root = await createTestWorkspace('.exact-destructured-props-', process.cwd());
		const props =
			mode === 'direct'
				? 'props:{label?:string;value:string;enabled:boolean}'
				: mode === 'renamed-defaults'
					? '{label:heading="fallback",value:message,enabled:active}:{label?:string;value:string;enabled:boolean}'
					: '{label="fallback",value,enabled}:{label?:string;value:string;enabled:boolean}';
		const setup =
			mode === 'direct'
				? 'const label=props.label ?? "fallback"; const value=props.value; const active=props.enabled;'
				: mode === 'renamed-defaults'
					? 'const label=heading; const value=message;'
					: 'const active=enabled;';
		const helper =
			'export function text(props:{value:string}) { return props.value.toUpperCase(); }';
		const files = await writeTestFiles(root, {
			'helper.ts': helper,
			'page.tsx': `import type {Component} from '@exactjs/core';
${mode === 'imported-helper' ? 'import {text} from "./helper.js";' : helper}
export function Child(${props}) {
 ${setup}
 return ()=> <p title={active ? \`Label: \${label}\` : 'disabled'}>{text({value})}</p>;
}
export function Page(this:Component<{value:string}>) {
 this.state.value='initial';
 return ()=> <main><button onClick={()=>this.state.value='updated'}>Update</button><Child label={this.state.value === 'initial' ? undefined : this.state.value} value={this.state.value} enabled={true}/></main>;
}`
		});
		const artifacts = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const page = artifacts.find((entry) => entry.inputFile === files['page.tsx'])!;
		const program = ts.createProgram([page.clientFile, page.serverFile], {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			skipLibCheck: true,
			noEmit: true,
			strict: true
		});
		expect(
			ts
				.getPreEmitDiagnostics(program)
				.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
		).toEqual([]);
		const server = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
		const rendered = await renderToHydratableString(
			createCompiledComponentReceipt(server.Page as AnyComponentFunction, {})
		);
		const container = document.createElement('div');
		container.innerHTML = rendered.htmlWithHydration;
		const original = container.querySelector('p');
		expect(original?.title).toBe('Label: fallback');
		expect(original?.textContent).toBe('INITIAL');
		const clientModule = await importArtifact(page.clientFile, path.join(root, 'client.mjs'));
		const Page = clientModule.Page as AnyComponentFunction;
		const client = hydrate(createCompiledComponentReceipt(Page, {}), container, {
			...composeExactComponentContracts(
				[Page, clientModule.Child as AnyComponentFunction],
				'client'
			),
			resumptions: rendered.resumptions
		});
		onTestFinished(() => client.dispose());
		expect(container.querySelector('p')).toBe(original);
		container.querySelector('button')!.click();
		await expect.poll(() => container.querySelector('p')?.textContent).toBe('UPDATED');
		expect(container.querySelector('p')?.title).toBe('Label: updated');
	}
);
