/** @vitest-environment jsdom */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToStream, renderToString } from '@exactjs/ssr';
import { createCompilerSession, transform } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { readStreamText } from '../../../ssr/src/test-support/streams.js';

// Retained consumers must lower against current dependency types across project keys.
it.each(['client', 'server'] as const)(
	'rechecks and executes %s output after a sibling declaration edit',
	async (target) => {
		const root = await createTestWorkspace('.exact-watched-types-', process.cwd());
		const app = path.join(root, 'app');
		const kit = path.join(root, 'kit');
		await Promise.all([mkdir(app), mkdir(kit)]);
		const config = {
			compilerOptions: {
				strict: true,
				skipLibCheck: true,
				jsx: 'react-jsx',
				jsxImportSource: '@exactjs/jsx',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				target: 'ES2022'
			}
		};
		await Promise.all([
			writeFile(path.join(app, 'tsconfig.json'), JSON.stringify(config)),
			writeFile(path.join(kit, 'tsconfig.json'), JSON.stringify(config))
		]);
		const dependency = path.join(kit, 'index.d.ts');
		const source =
			'import type {Model} from "../kit/index.js";export function View(props:Model){return()=> <p>{props.value}</p>; }';
		const filename = path.join(app, 'View.tsx');
		await writeFile(filename, source);
		const session = createCompilerSession();
		onTestFinished(() => session.dispose());
		const options = {
			filename,
			root: app,
			configFile: path.join(app, 'tsconfig.json'),
			target,
			generatedValidation: 'semantic' as const
		};
		await writeFile(dependency, 'export interface Model {value:string}');
		transform(source, { ...options, session });
		for (const [index, type, value, text] of [
			[0, 'readonly string[]', ['one', 'two'], 'onetwo'],
			[1, 'string', 'recovered', 'recovered']
		] as const) {
			await writeFile(dependency, `export interface Model {value:${type}}`);
			expect(session.invalidate(dependency).diagnostics).toEqual([]);
			const compiled = transform(source, { ...options, session });
			const fresh = createCompilerSession();
			try {
				expect(compiled).toBe(transform(source, { ...options, session: fresh }));
			} finally {
				fresh.dispose();
			}
			const entry = path.join(app, `View-${index}.exact.${target}.ts`);
			await writeFile(entry, compiled);
			const module = await importArtifact(entry, path.join(app, `run-${index}.mjs`));
			if (target === 'client') {
				const host = document.createElement('div');
				try {
					render(receipt(module.View as never, { value }), host);
					expect(host.textContent).toBe(text);
				} finally {
					unmount(host);
				}
				expect(host.childNodes).toHaveLength(0);
			} else {
				const output = await renderToString(receipt(module.View as never, { value }), {
					markers: false
				});
				expect(output.html).toBe(`<p>${text}</p>`);
				expect(
					await readStreamText(
						renderToStream(receipt(module.View as never, { value }), { markers: false })
					)
				).toBe(output.html);
			}
		}
	}
);
