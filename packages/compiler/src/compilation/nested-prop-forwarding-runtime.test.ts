/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { flushSync, batch, watch } from '@exactjs/reactive';
import type { Component, AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { findElementOwner } from '@exactjs/dom/testing';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from '../../../hydrate/src/index.js';
import { observeNestedForwarding } from '../../../component-composition-corpus/test-support/nested-forwarding-journey.js';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace, repositoryPath } from '../test-support/workspace.js';
async function compile(source: string) {
	const root = await createCompilerTestWorkspace('.exact-nested-forwarding-', process.cwd());
	const input = path.join(root, 'page.tsx');
	await writeFile(input, source);
	const [artifact] = await compileProjectArtifacts([input], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	return { client, server, artifact: artifact! };
}
async function sourceFixture() {
	return readFile(
		repositoryPath(
			'packages/component-composition-corpus/test-support/nested-forwarding.fixtures.tsx'
		),
		'utf8'
	);
}
// Preserve the original scalar computation and every interaction, through both receipt routes.
const forwardingForms = [
	['standalone', 'props.record.value', false],
	['component slot', 'props.record.value', true],
	['literal index', 'props.record["value"]', false],
	...[
		['parenthesized', '(props.record).value'],
		['asserted', '(props.record as {value:number}).value'],
		['nonnull', 'props.record!.value'],
		['parenthesized index', '(props.record)["value"]'],
		['satisfies', '(props.record satisfies {value:number}).value']
	].flatMap(([name, expression]) => [
		[name!, expression!, false] as const,
		[name! + ' component slot', expression!, true] as const
	])
] as const;
for (const [shape, expression, componentSlot] of forwardingForms)
	it(`retains nested forwarding through ${shape}, replacement and disposal`, async () => {
		let source = (await sourceFixture()).replace('props.record.value', expression);
		if (componentSlot)
			source = source.replace(
				'<Leaf value={' + expression + '} />',
				'<main><Leaf value={' + expression + '} /></main>'
			);
		const { client, server } = await compile(source);
		for (const mode of ['mount', 'hydrate'] as const) {
			const host = document.createElement('div');
			const reports: unknown[] = [];
			let original: Element | null = null;
			try {
				if (mode === 'hydrate') {
					const output = await renderToHydratableString(receipt(server.NestedOwner as never, {}));
					host.innerHTML = output.html;
					original = host.querySelector('output');
					hydrate(receipt(client.NestedOwner as never, {}), host, {
						...composeExactComponentContracts(
							[client.NestedOwner as AnyComponentFunction],
							'client'
						),
						resumptions: output.resumptions,
						onMismatch: 'throw',
						onErrorReport: (report) => reports.push(report.error)
					});
				} else
					render(receipt(client.NestedOwner as never, {}), host, {
						onErrorReport: (report) => reports.push(report.error)
					});
				const retained = !original || original === host.querySelector('output');
				const owner = (
					client.nestedOwner as () => Component<{
						record: {
							value: number;
						};
					}>
				)();
				const observations = observeNestedForwarding(host, owner);
				expect(observations.map((entry) => entry.text)).toEqual([
					'2',
					'3',
					'11',
					'11',
					'12',
					'',
					''
				]);
				expect(
					observations.slice(0, 5).every((entry) => entry.outputIdentity && entry.leafIdentity)
				).toBe(true);
				expect(observations.slice(0, 5).map((entry) => entry.leafValue)).toEqual([
					1, 2, 10, 10, 11
				]);
				expect(observations.map((entry) => entry.state)).toEqual([1, 2, 10, 10, 11, 11, 12]);
				expect(retained).toBe(true);
				expect(reports).toEqual([]);
			} finally {
				unmount(host);
			}
		}
	});
// Nullable and changing-key controls exercise the same complete-reader eligibility boundary.
for (const selection of ['nullable', 'computed'] as const)
	it(`rebinds ${selection} nested selections without reviving old receivers`, async () => {
		const expression =
			selection === 'nullable' ? '(props.record)?.value ?? 0' : '(props.record!)[props.field]';
		const { client } = await compile(`import type {Component} from '@exactjs/core';
export let owner:Component<{record:{value:number;other:number}|null|undefined;field:'value'|'other'}>;
function Leaf(props:{value:number}){return()=> <output>{props.value+1}</output>;}
function Middle(props:{record:{value:number;other:number}|null|undefined;field:'value'|'other'}){
 return()=> <Leaf value={${expression}}/>;
}
export function Page(this:typeof owner){owner=this;this.state.record={value:1,other:10};this.state.field='value';
 return()=> <Middle record={this.state.record} field={this.state.field}/>;}`);
		const host = document.createElement('div'),
			reports: unknown[] = [],
			texts: string[] = [];
		try {
			render(receipt(client.Page as never, {}), host, {
				onErrorReport: (r) => reports.push(r.error)
			});
			const state = (
				client.owner as Component<{
					record:
						| {
								value: number;
								other: number;
						  }
						| null
						| undefined;
					field: 'value' | 'other';
				}>
			).state;
			const old = state.record!,
				output = host.querySelector('output'),
				leaf = findElementOwner(output!)!;
			const observe = () => {
				flushSync();
				texts.push(host.textContent!);
				expect(host.querySelector('output')).toBe(output);
				expect(findElementOwner(output!)).toBe(leaf);
			};
			observe();
			old.value = 2;
			observe();
			if (selection === 'nullable') {
				state.record = undefined;
				observe();
				state.record = null;
				observe();
				state.record = { value: 10, other: 20 };
				observe();
				old.value = 3;
				observe();
				state.record.value = 11;
				observe();
				expect(texts).toEqual(['2', '3', '1', '1', '11', '11', '12']);
			} else {
				state.field = 'other';
				observe();
				old.value = 3;
				observe();
				old.other = 11;
				observe();
				state.record = { value: 20, other: 30 };
				observe();
				old.other = 12;
				observe();
				state.record.other = 31;
				observe();
				expect(texts).toEqual(['2', '3', '11', '11', '12', '31', '31', '32']);
			}
			expect(reports).toEqual([]);
		} finally {
			unmount(host);
		}
		expect(host.textContent).toBe('');
	});
it('keeps mixed nested and scalar inputs coherent in one batch', async () => {
	const { client } = await compile(`import type {Component} from '@exactjs/core';
export let owner:Component<{record:{value:number};offset:number}>;
/** @exact pure */ function format(value:number){return value+1;}
function Leaf(this:Component<{output:number}>,props:{value:number;offset:number}){
 this.state.output=format(props.value+props.offset);return()=> <output>{this.state.output}</output>;
}
function Middle(props:{record:{value:number};offset:number}){return()=> <Leaf value={props.record.value} offset={props.offset}/>;}
export function Page(this:Component<{record:{value:number};offset:number}>){owner=this;this.state.record={value:1};this.state.offset=0;return()=> <Middle record={this.state.record} offset={this.state.offset}/>;}`);
	const host = document.createElement('div');
	const reports: unknown[] = [];
	let stop: (() => void) | undefined;
	try {
		render(receipt(client.Page as never, {}), host, {
			onErrorReport: (r) => reports.push(r.error)
		});
		const owner = client.owner as Component<{
			record: {
				value: number;
			};
			offset: number;
		}>;
		const output = host.querySelector('output')!;
		const leaf = findElementOwner(output)!;
		const publications: unknown[] = [];
		stop = watch(() => {
			publications.push(leaf.state.output);
		});
		batch(() => {
			owner.state.record.value = 2;
			owner.state.offset = 10;
		});
		flushSync();
		expect(publications).toEqual([2, 13]);
		expect(host.textContent).toBe('13');
		batch(() => {
			owner.state.record = { value: 20 };
			owner.state.offset = 2;
		});
		flushSync();
		expect(publications).toEqual([2, 13, 23]);
		expect(host.querySelector('output')).toBe(output);
		expect(reports).toEqual([]);
	} finally {
		stop?.();
		unmount(host);
	}
});
it('retains the complete scalar supplier fast path', async () => {
	const source = (await sourceFixture())
		.replace('props.record.value', 'props.value')
		.replace(
			'function Middle(props: { record: { value: number } })',
			'function Middle(props: { value: number })'
		)
		.replace('<Middle record={this.state.record}', '<Middle value={this.state.record.value}');
	const { client, artifact } = await compile(source);
	expect(artifact.client.code).toContain('__exactComponentReceiptUpdate(');
	const host = document.createElement('div');
	try {
		render(receipt(client.NestedOwner as never, {}), host);
		const owner = (
			client.nestedOwner as () => Component<{
				record: {
					value: number;
				};
			}>
		)();
		const observations = observeNestedForwarding(host, owner);
		expect(observations.map((entry) => entry.text)).toEqual(['2', '3', '11', '11', '12', '', '']);
	} finally {
		unmount(host);
	}
});
it('retains stable declarative callback receivers through member updates', async () => {
	const { client, artifact } = await compile(`import type {Component} from '@exactjs/core';
export let owner:Component<{rows:{id:string;value:number}[]}>;
function Leaf(props:{value:number}){return()=> <output>{props.value}</output>;}
export function Page(this:Component<{rows:{id:string;value:number}[]}>){owner=this;this.state.rows=[{id:'a',value:1}];return()=> <main>{this.state.rows.map(row=> <Leaf key={row.id} value={row.value}/>)}</main>;}`);
	expect(artifact.client.code).toContain('[__exactPropertyOperand, row, "value"]');
	const host = document.createElement('div');
	try {
		render(receipt(client.Page as never, {}), host);
		const state = (
			client.owner as Component<{
				rows: {
					id: string;
					value: number;
				}[];
			}>
		).state;
		const output = host.querySelector('output');
		state.rows[0]!.value = 2;
		flushSync();
		expect(host.textContent).toBe('2');
		state.rows[0]!.value = 3;
		flushSync();
		expect(host.textContent).toBe('3');
		expect(host.querySelector('output')).toBe(output);
	} finally {
		unmount(host);
	}
});
it('preserves an authored callable selected through a replaceable nested receiver', async () => {
	const { client } = await compile(`import type {Component} from '@exactjs/core';
export let owner:Component<{record:{value:()=>number}}>;
let calls=0;export const first=()=>{calls++;return 1;};export const second=()=>{calls++;return 2;};
export function callCount(){return calls;}
export let leaf:{value:()=>number};
function Leaf(props:{value:()=>number}){leaf=props;return()=> <output>ready</output>;}
function Middle(props:{record:{value:()=>number}}){return()=> <Leaf value={props.record.value}/>;}
export function Page(this:Component<{record:{value:()=>number}}>){owner=this;this.state.record={value:first};return()=> <Middle record={this.state.record}/>;}`);
	const host = document.createElement('div');
	try {
		render(receipt(client.Page as never, {}), host);
		const owner = client.owner as Component<{
			record: {
				value: () => number;
			};
		}>;
		const leaf = client.leaf as {
			value: () => number;
		};
		expect(leaf.value).toBe(client.first);
		owner.state.record.value = client.second as () => number;
		flushSync();
		expect(leaf.value).toBe(client.second);
		owner.state.record = { value: client.first as () => number };
		flushSync();
		expect(leaf.value).toBe(client.first);
		expect((client.callCount as () => number)()).toBe(0);
	} finally {
		unmount(host);
	}
});
it('keeps a returned authored reactive value unread across receiver replacement', async () => {
	const { client } = await compile(`import type {ReactiveValue} from '@exactjs/reactive';
export class Box { constructor(public value:ReactiveValue<number>){} }
export let leaf:{value:ReactiveValue<number>};
function Leaf(props:{value:ReactiveValue<number>}){leaf=props;return()=> <output>ready</output>;}
function Middle(props:{record:Box}){return()=> <Leaf value={props.record.value}/>;}
export function Page(props:{record:Box}){return()=> <Middle record={props.record}/>;}`);
	const { computed } = await import('@exactjs/reactive');
	let reads = 0;
	const first = computed(() => {
		reads++;
		return 7;
	});
	const second = computed(() => {
		reads++;
		return 7;
	});
	const Box = client.Box as new (value: typeof first) => {
		value: typeof first;
	};
	const host = document.createElement('div');
	try {
		render(receipt(client.Page as never, { record: new Box(first) }), host);
		const leaf = client.leaf as {
			value: typeof first;
		};
		expect(leaf.value).toBe(first);
		render(receipt(client.Page as never, { record: new Box(second) }), host);
		flushSync();
		expect(leaf.value).toBe(second);
		expect(reads).toBe(0);
	} finally {
		unmount(host);
	}
});
