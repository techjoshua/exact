import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace } from '../test-support/workspace.js';

it.each(['direct', 'renamed', 'const-alias', 'namespace', 'literal-member'])(
	'keeps %s DOM teardown in the browser when rendering a server artifact',
	async (shape) => {
		const parent = path.resolve('.tmp/dom-declaration-placement');
		await mkdir(parent, { recursive: true });
		const directory = await createTestWorkspace('case-', parent);
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const imports =
			shape === 'renamed'
				? "import {unmount as teardown} from '@exactjs/dom';"
				: shape === 'namespace' || shape === 'literal-member'
					? "import * as DOM from '@exactjs/dom';"
					: "import {unmount} from '@exactjs/dom';";
		const callee =
			shape === 'renamed' || shape === 'const-alias'
				? 'teardown'
				: shape === 'namespace'
					? 'DOM.unmount'
					: shape === 'literal-member'
						? "DOM['unmount']"
						: 'unmount';
		const source = `${imports}
${shape === 'const-alias' ? 'const teardown=unmount;' : ''}
export let executions=0;
function Browser(){executions++;${callee}(null as unknown as Element);return()=> <p>browser</p>}
export function Page(){return()=> <main><Browser/></main>}`;
		const entry = path.join(directory, 'Page.tsx');
		await writeFile(entry, source);
		const result = compiler.request({
			kind: 'compile',
			target: 'server',
			serverComponents: true,
			id: entry,
			source,
			root: process.cwd(),
			diagnostics: 'semantic'
		});
		expect(result.error).toBeUndefined();
		expect(result.diagnostics).toEqual([]);
		expect(
			result.analysis.components.find((component) => component.name === 'Browser')?.placement
		).toBe('client');
		await writeFile(entry, result.code!);
		const module = await importArtifact(entry, path.join(directory, 'Page.mjs'));
		const rendered = await renderToString(
			createCompiledComponentReceipt(module.Page as AnyComponentFunction, {})
		);
		expect(rendered.html).toContain('<main');
		expect(module.executions).toBe(0);
	}
);
