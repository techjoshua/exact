/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { hydrate } from '@exactjs/hydrate/enhanced';
import { renderToHydratableString } from '@exactjs/ssr/enhanced';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
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
		['quoted-field', 'rows.map(row => <li>{row.label}</li>)']
	].flatMap(([name, expression]) =>
		['mount', 'hydrate'].map((mode) => [name!, expression!, mode!] as const)
	)
)(
	'preserves keyed item identity through %s array mapping in %s',
	async (_name, expression, mode) => {
		const root = await createTestWorkspace('.exact-collection-source-', process.cwd());
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
			'list.tsx': `interface Row{/** @exact key */ ${_name === 'quoted-field' ? '"id-key"' : 'id'}:string;label:string} export function Lists(props:{rows:Row[]}){const rows=props.rows;return()=> <ul>{${expression}}</ul>} export const listRoot=(rows:Row[])=> <Lists rows={rows}/>`
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

// A user method can return a keyed array while retaining its own selection and ordering semantics.
it('preserves an ordinary map method and its returned keyed values', async () => {
	const root = await createTestWorkspace('.exact-collection-custom-', process.cwd());
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
		const root = await createTestWorkspace('.exact-authored-collection-key-', process.cwd());
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
