/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { render, unmount } from '@exactjs/dom';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { flushSync } from '@exactjs/reactive';
import { hydrate } from '@exactjs/hydrate/enhanced';
import { renderToHydratableString } from '@exactjs/ssr/enhanced';
import { compileProjectArtifacts } from '../index.js';
import {
	createTestWorkspace,
	createCompilerTestWorkspace,
	writeTestFiles
} from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(
	[
		['direct', 'rows.map(row => <li key={row.id}>{row.label}</li>)'],
		['indexed', "rows['map'](row => <li key={row.id}>{row.label}</li>)"],
		['wrapped-member', '(rows.map)(row => <li key={row.id}>{row.label}</li>)'],
		['wrapped-callback', 'rows.map((row => <li key={row.id}>{row.label}</li>))'],
		['destructured', 'rows.map(({id,label}) => <li>{label}</li>)'],
		[
			'default-destructured',
			'rows.map(({id,label="fallback"}={id:"empty",label:""})=><li>{label}</li>)'
		],
		['quoted-field', 'rows.map(row => <li>{row.label}</li>)'],
		['derived-imported', 'rows.map(row => <li>{row.label}</li>)']
	].flatMap(([name, expression]) =>
		['mount', 'hydrate'].map((mode) => [name!, mode, expression!] as const)
	)
)(
	'preserves keyed item identity through %s array mapping in %s',
	async (_name, mode, expression) => {
		const root = await createTestWorkspace('.exact-collection-source-', process.cwd());
		const derived = _name === 'derived-imported';
		const key = _name === 'quoted-field' ? '"id-key"' : 'id';
		const row = `interface Row{/** @exact key */ ${key}:string;label:string}`;
		const files = await writeTestFiles(root, {
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'bundler',
					jsx: 'preserve',
					jsxImportSource: '@exactjs/jsx',
					skipLibCheck: true
				}
			}),
			...(derived ? { 'model.ts': `export ${row}` } : {}),
			'list.tsx': `${derived ? "import type {Row} from './model.js';" : row}
export function Lists(props:{rows:Row[]}){const rows=${derived ? 'props.rows.filter(row=>row.label!=="")' : 'props.rows'};return()=> <ul>{${expression}}</ul>}
export const listRoot=(rows:Row[])=> <Lists rows={rows}/>`
		});
		const [artifact] = await compileProjectArtifacts([files['list.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		type Row = { id: string; label: string };
		const compiledRoot = client.listRoot as (rows: unknown[]) => Parameters<typeof render>[0];
		const listRoot = (rows: Row[]) =>
			compiledRoot(
				_name === 'quoted-field' ? rows.map(({ id, label }) => ({ 'id-key': id, label })) : rows
			);
		const container = document.createElement('div');
		onTestFinished(() => {
			unmount(container);
		});
		const reports: unknown[] = [];
		const initial = [
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' }
		];
		if (mode === 'hydrate') {
			const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
			const serverRoot = server.listRoot as (
				rows: unknown[]
			) => Parameters<typeof renderToHydratableString>[0];
			const result = await renderToHydratableString(
				serverRoot(
					_name === 'quoted-field'
						? initial.map(({ id, label }) => ({ 'id-key': id, label }))
						: initial
				)
			);
			container.innerHTML = result.html;
			const nodes = [...container.querySelectorAll('li')];
			hydrate(listRoot(initial), container, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (report) => reports.push(report.error)
			});
			expect(container.querySelectorAll('li')[0]).toBe(nodes[0]);
			expect(container.querySelectorAll('li')[1]).toBe(nodes[1]);
		} else
			render(listRoot(initial), container, {
				onErrorReport: (report) => reports.push(report.error)
			});

		flushSync();
		const [a, b] = container.querySelectorAll('li');
		expect(a?.textContent).toBe('A');
		expect(b?.textContent).toBe('B');
		render(
			listRoot([
				{ id: 'b', label: 'B1' },
				{ id: 'a', label: 'A1' }
			]),
			container
		);
		flushSync();
		expect(container.querySelectorAll('li')[0]).toBe(b);
		expect(container.querySelectorAll('li')[1]).toBe(a);
		expect(b?.textContent).toBe('B1');
		expect(a?.textContent).toBe('A1');
		render(listRoot([{ id: 'b', label: 'B2' }]), container);
		flushSync();
		expect(container.querySelector('li')).toBe(b);
		expect(container.contains(a!)).toBe(false);
		expect(reports).toEqual([]);
	}
);

it.each(['mount', 'hydrate'])(
	'keeps existing keyed nodes in a component-local view helper on %s',
	async (mode) => {
		const root = await createCompilerTestWorkspace('.exact-local-keyed-', process.cwd());
		const files = await writeTestFiles(root, {
			'list.tsx': `interface Row {id:string;label:string}
export function List(props:{rows:Row[]}) {
 function view(rows:Row[]){return <ul>{rows.map(row=><li key={row.id}>{row.label}</li>)}</ul>}
 return ()=>view(props.rows);
}`
		});
		const [artifact] = await compileProjectArtifacts([files['list.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const rows = [
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' }
		];
		const view = (component: unknown, items = rows) =>
			createCompiledComponentInputReceipt(component as AnyComponentFunction, { rows: items });
		const host = document.createElement('div'),
			errors: unknown[] = [];
		onTestFinished(() => {
			unmount(host);
		});
		if (mode === 'hydrate') {
			const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
			const rendered = await renderToHydratableString(view(server.List));
			host.innerHTML = rendered.html;
			const before = [...host.querySelectorAll('li')];
			hydrate(view(client.List), host, {
				resumptions: rendered.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => errors.push(r.error)
			});
			expect(host.querySelectorAll('li')[0]).toBe(before[0]);
			expect(host.querySelectorAll('li')[1]).toBe(before[1]);
		} else render(view(client.List), host, { onErrorReport: (r) => errors.push(r.error) });
		flushSync();
		const [a, b] = host.querySelectorAll('li');
		expect(host.textContent).toBe('AB');
		render(view(client.List, rows.slice().reverse()), host);
		flushSync();
		expect(host.textContent).toBe('BA');
		expect(host.querySelectorAll('li')[0]).toBe(b);
		expect(host.querySelectorAll('li')[1]).toBe(a);
		expect(errors).toEqual([]);
	}
);

// A user method can return a keyed array while retaining its own selection and ordering semantics.
it('preserves an ordinary map method and its returned keyed values', async () => {
	const root = await createCompilerTestWorkspace('.exact-collection-custom-', process.cwd());
	const files = await writeTestFiles(root, {
		'list.tsx': `interface Row{id:string;label:string} export function Lists(props:{rows:Row[]}){const custom={map(callback:(row:Row)=>unknown){return props.rows.slice().reverse().map(row=><li key={row.id}>{row.label}</li>)}};return()=> <ul>{custom.map(row=><li key={row.id}>{row.label}</li>)}</ul>} export const listRoot=(rows:Row[])=> <Lists rows={rows}/>`
	});
	const [artifact] = await compileProjectArtifacts([files['list.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const listRoot = client.listRoot as (
		rows: { id: string; label: string }[]
	) => Parameters<typeof render>[0];
	const container = document.createElement('div');
	const reports: unknown[] = [];
	onTestFinished(() => {
		unmount(container);
	});
	render(
		listRoot([
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' }
		]),
		container,
		{ onErrorReport: (report) => reports.push(report.error) }
	);
	flushSync();
	const [b, a] = container.querySelectorAll('li');
	expect(b?.textContent).toBe('B');
	expect(a?.textContent).toBe('A');
	render(
		listRoot([
			{ id: 'b', label: 'B1' },
			{ id: 'a', label: 'A1' }
		]),
		container
	);
	flushSync();
	expect(container.querySelectorAll('li')[0]).toBe(a);
	expect(container.querySelectorAll('li')[1]).toBe(b);
	expect(a?.textContent).toBe('A1');
	expect(b?.textContent).toBe('B1');
	expect(reports).toEqual([]);
});

// Authored keys override inferred data identity, including keys scoped to destructured bindings.
it.each(
	[
		['literal', 'rows.map(row=><li key="slot">{row.detail}</li>)'],
		['escaped-literal', 'rows.map(row=><li key="slot&quot;&amp;key">{row.detail}</li>)'],
		['destructured', 'rows.map(({id,label,detail})=><li key={label}>{detail}</li>)'],
		['local-key', 'rows.map(row=>{const key=row.label;return <li key={key}>{row.detail}</li>})'],
		[
			'asserted-return',
			"rows.map(row=>(<li key={row.label}>{row.detail}</li> as import('@exactjs/core').Child))"
		],
		[
			'destructured-function',
			'rows.map(function({label,detail}){return <li key={label}>{detail}</li>})'
		]
	].flatMap(([name, expression]) =>
		['mount', 'hydrate'].map((mode) => [name!, expression!, mode!] as const)
	)
)(
	'retains authored %s key identity across new data records in %s',
	async (name, expression, mode) => {
		const root = await createCompilerTestWorkspace(
			'.exact-authored-collection-key-',
			process.cwd()
		);
		const files = await writeTestFiles(root, {
			'list.tsx': `interface Row{/** @exact key */ id:string;label:string;detail:string}export function Lists(props:{rows:Row[]}){const rows=props.rows;return()=> <ul>{${expression}}</ul>}export const listRoot=(rows:Row[])=> <Lists rows={rows}/>`
		});
		const [artifact] = await compileProjectArtifacts([files['list.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const listRoot = client.listRoot as (
			rows: { id: string; label: string; detail: string }[]
		) => Parameters<typeof render>[0];
		const container = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			unmount(container);
		});
		const initial = [{ id: 'a', label: 'stable', detail: 'A' }];
		if (mode === 'hydrate') {
			const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
			const serverRoot = server.listRoot as (
				rows: typeof initial
			) => Parameters<typeof renderToHydratableString>[0];
			const result = await renderToHydratableString(serverRoot(initial));
			container.innerHTML = result.html;
			const adopted = container.querySelector('li');
			hydrate(listRoot(initial), container, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r.error)
			});
			expect(container.querySelector('li')).toBe(adopted);
		} else render(listRoot(initial), container, { onErrorReport: (r) => reports.push(r.error) });
		flushSync();
		const first = container.querySelector('li');
		expect(first?.textContent).toBe('A');
		render(listRoot([{ id: 'b', label: 'stable', detail: 'B' }]), container);
		flushSync();
		expect(container.querySelector('li')).toBe(first);
		expect(first?.textContent).toBe('B');
		render(listRoot([{ id: 'b', label: 'replacement', detail: 'C' }]), container);
		flushSync();
		if (name!.startsWith('destructured') || name === 'local-key' || name === 'asserted-return')
			expect(container.querySelector('li')).not.toBe(first);
		else expect(container.querySelector('li')).toBe(first);
		expect(container.querySelector('li')?.textContent).toBe('C');
		render(listRoot([]), container);
		flushSync();
		expect(container.querySelector('li')).toBeNull();
		expect(reports).toEqual([]);
	}
);

it.each([
	{
		name: 'a computed name read by the render callback',
		key: 'row.id',
		body: '<li>{row.label}</li>',
		field: 'props.fieldName',
		browser: true,
		text: 'browser value'
	},
	{
		name: 'a computed name read by the key callback',
		key: 'row.label ?? row.id',
		body: '<li>{row.id}</li>',
		field: 'props.fieldName',
		browser: true,
		text: 'a'
	},
	{
		name: 'a computed key disjoint from both eager callbacks',
		key: 'row.id',
		body: '<li>{row.id}</li>',
		field: 'props.fieldName',
		browser: false,
		text: 'a'
	},
	{
		name: 'an asserted local key whose value can reach the getter',
		key: 'row.id',
		body: '<li>{row.id}</li>',
		field: 'fieldName',
		setup: 'const fieldName = "id" as "other";',
		browser: true,
		text: 'browser value'
	},
	{
		name: 'a getter replaced by the key callback',
		key: '{ Object.defineProperty(row, "label", {value:"safe"}); return row.id; }',
		body: '<li>{row.label}</li>',
		field: '"label"',
		browser: false,
		text: 'safe',
		verifyMount: true
	},
	{
		name: 'a key callback writing a different property on the same item',
		key: '{ Object.defineProperty(row, "other", {value:"safe"}); return row.id; }',
		body: '<li>{row.label}</li>',
		field: '"label"',
		browser: true,
		text: 'browser value'
	},
	{
		name: 'a key callback writing the same property on a different object',
		key: '{ Object.defineProperty(other, "label", {value:"safe"}); return row.id; }',
		body: '<li>{row.label}</li>',
		field: '"label"',
		setup: 'const other = {};',
		browser: true,
		text: 'browser value'
	},
	{
		name: 'an unknown key write descriptor',
		key: '{ Object.defineProperty(row, "other", props.descriptor!); return row.id; }',
		body: '<li>{row.label}</li>',
		field: '"label"',
		descriptorProp: ' descriptor={{value: 1}}',
		browser: true,
		text: 'browser value'
	},
	{
		name: 'a key callback writing through a proxy for the item',
		key: '{ Object.defineProperty(new Proxy(row, {defineProperty: () => true}), "label", {value:"safe"}); return row.id; }',
		body: '<li>{row.label}</li>',
		field: '"label"',
		browser: true,
		text: 'browser value'
	},
	{
		name: 'a disjoint getter replacement',
		key: '{ Object.defineProperty(row, "other", {value:"safe"}); return row.id; }',
		body: '<li>{row.label}</li>',
		field: '"label"',
		otherGetter: ", get other(){return 'other'}",
		browser: true,
		text: 'browser value'
	},
	{
		name: 'a getter reached only by an event handler',
		key: 'row.id',
		body: '<li><button onClick={() => { document.title = "clicked " + row.label; }}>{row.id}</button></li>',
		field: '"label"',
		browser: false,
		text: 'a',
		click: true
	}
])(
	'accounts for $name in a component list',
	async ({
		key,
		body,
		field,
		setup,
		browser,
		text,
		click,
		verifyMount,
		descriptorProp,
		otherGetter
	}) => {
		const root = await createCompilerTestWorkspace('.exact-collection-get-', process.cwd());
		const files = await writeTestFiles(root, {
			'list.tsx': `import type {Component} from '@exactjs/core';
export function List(this:Component<{}>,props:{fieldName: 'label'|'other'; descriptor?:PropertyDescriptor}) {
	${setup ?? ''}
	const rows:Array<{id:string;label?:string;other?:string}> = [
		{id:'a', get [${field}](){return document.title}${otherGetter ?? ''}}
	];
	return () => <ul>{this.map(rows,row=>${key},row=>${body})}</ul>;
}
export const listRoot = () => <List fieldName="label"${descriptorProp ?? ''}/>;`
		});
		const [artifact] = await compileProjectArtifacts([files['list.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});

		const previousTitle = document.title;
		const container = document.createElement('div');
		onTestFinished(() => {
			unmount(container);
			document.title = previousTitle;
		});
		document.title = 'browser value';

		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const serverRoot = server.listRoot as () => Parameters<typeof renderToHydratableString>[0];
		const result = await renderToHydratableString(serverRoot());
		if (browser) expect(result.html).toContain('data-exact-client-boundary=');
		else expect(result.html).toContain('<li');
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const clientRoot = client.listRoot as () => Parameters<typeof render>[0];
		const reports: unknown[] = [];
		if (browser) render(clientRoot(), container, { onErrorReport: (r) => reports.push(r.error) });
		else {
			container.innerHTML = result.html;
			expect(container.textContent).toBe(text);
			const original = container.querySelector('li');
			hydrate(clientRoot(), container, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r.error)
			});
			expect(container.querySelector('li')).toBe(original);
		}
		flushSync();
		expect(reports).toEqual([]);
		expect(container.textContent).toBe(text);
		if (verifyMount) {
			const fresh = document.createElement('div');
			onTestFinished(() => unmount(fresh));
			const mountReports: unknown[] = [];
			render(clientRoot(), fresh, { onErrorReport: (r) => mountReports.push(r.error) });
			flushSync();
			expect(mountReports).toEqual([]);
			expect(fresh.textContent).toBe(text);
		}
		if (click) {
			container.querySelector('button')!.click();
			expect(document.title).toBe('clicked browser value');
		}
	}
);
