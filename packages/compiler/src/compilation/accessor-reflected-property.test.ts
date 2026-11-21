/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToString } from '@exactjs/ssr';
import { expect, it, onTestFinished, vi } from 'vitest';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';

const capture = `function capture(input: unknown): Record<string, unknown> {
	if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new TypeError();
	const prototype = Object.getPrototypeOf(input);
	if (prototype !== Object.prototype && prototype !== null) throw new TypeError();
	const record = Object.assign(Object.create(null) as Record<string, unknown>, input);
	for (const key of Object.getOwnPropertyNames(input))
		if (!Object.hasOwn(record, key))
			Object.defineProperty(record, key, {value: Reflect.get(input, key)});
	return record;
}`;

const read = `function read(input: object) { return Reflect.get(input, 'hidden'); }`;
const hidden = `Object.defineProperty({label:'ready'}, 'hidden', {get: () => document.title})`;

it.each([
	{
		name: 'a named Get on a returned descriptor passed through an authored helper',
		definitions: read,
		setup: `const value = read(${hidden});`,
		expected: 'browser title',
		browser: true
	},
	{
		name: 'a literal Reflect key during another descriptor installation',
		definitions: capture.replace('Reflect.get(input, key)', "Reflect.get(input, 'hidden')"),
		setup: `const value = capture(${hidden}).hidden;`,
		expected: 'browser title',
		browser: true
	},
	{
		name: 'an own-name binding during capture of a nonenumerable property',
		definitions: capture,
		setup: `const value = capture(${hidden}).hidden;`,
		expected: 'browser title',
		browser: true
	},
	{
		name: 'an eager own-name read of a property absent from the render result',
		definitions: capture,
		setup: `const value = capture(${hidden}).label;`,
		expected: 'ready',
		browser: true
	},
	{
		name: 'a portable nonenumerable property captured through own names',
		definitions: capture,
		setup: `const value = capture(${hidden.replace('document.title', "'portable'")}).hidden;`,
		expected: 'portable'
	},
	{
		name: 'a names-only operation',
		definitions: '',
		setup: `const value = Object.getOwnPropertyNames(${hidden}).length;`,
		expected: '2'
	},
	{
		name: 'an authored names method that omits the getter key',
		definitions: `const names = {getOwnPropertyNames(_input:object) { return ['label']; }};
${capture.replace('Object.getOwnPropertyNames', 'names.getOwnPropertyNames')}`,
		setup: `const value = capture(${hidden}).label;`,
		expected: 'ready'
	},
	{
		name: 'an authored descriptor method with a held getter',
		definitions: read,
		setup: `const Object = {defineProperty(target:object, _key:string, _descriptor:PropertyDescriptor) {
			return {...target, hidden:'ready'};
		}};
		const value = read(${hidden});`,
		expected: 'ready'
	},
	{
		name: 'an authored Reflect method with a held getter',
		definitions: `const Reflect = {get(_input:object, _key:string) { return 'ready'; }};
${read}`,
		setup: `const value = read(${hidden});`,
		expected: 'ready'
	}
])(
	'preserves reflected property effects for $name',
	async (test) => {
		const root = await createCompilerTestWorkspace('.exact-reflected-property-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			entry,
			`${test.definitions}\nexport function Page() { ${test.setup} return () => <p>{String(value)}</p>; }`
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		let html: string;
		vi.stubGlobal('document', undefined);
		try {
			({ html } = await renderToString(receipt(server.Page as never, {}), { markers: false }));
		} finally {
			vi.unstubAllGlobals();
		}
		if (test.browser) expect(html).toContain('data-exact-client-boundary=');
		else expect(html).toBe(`<p>${test.expected}</p>`);

		const title = document.title;
		document.title = 'browser title';
		onTestFinished(() => {
			document.title = title;
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const host = document.createElement('div');
		onTestFinished(() => unmount(host));
		const errors: unknown[] = [];
		render(receipt(client.Page as never, {}), host, {
			onErrorReport: (report) => errors.push(report.error)
		});
		expect(errors).toEqual([]);
		expect(host.textContent).toBe(test.expected);
	},
	20000
);
