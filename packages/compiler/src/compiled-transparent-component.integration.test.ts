/**
 * @vitest-environment jsdom
 */
import * as exactCore from '@exactjs/core';
import * as exactRenderRuntime from '@exactjs/core/runtime/render';
import * as exactRenderOperationsRuntime from '@exactjs/core/runtime/render-operations';
import * as exactRenderConstructionRuntime from '@exactjs/core/runtime/component-construction/render';
import * as exactDurableConstructionRuntime from '@exactjs/core/runtime/component-construction/durable';
import * as exactComponentAbiRuntime from '@exactjs/core/runtime/component-abi';
import * as exactComponentOperationsRuntime from '@exactjs/core/runtime/component-operations';
import * as exactListsRuntime from '@exactjs/core/runtime/lists';
import * as exactCollectionsRuntime from '@exactjs/core/runtime/collections';
import * as exactContextsRuntime from '@exactjs/core/runtime/contexts';
import * as exactRefsRuntime from '@exactjs/core/runtime/refs';
import * as exactReactivityRuntime from '@exactjs/core/runtime/reactivity';
import * as exactTasksRuntime from '@exactjs/core/runtime/tasks';
import * as exactComponentBrandingRuntime from '@exactjs/core/runtime/component-branding';
import { render, unmount } from '@exactjs/dom';
import { createTestOperation } from '@exactjs/testing/internal/fixtures';
import * as exactDomDirectComponentRuntime from '@exactjs/dom/runtime/direct-component';
import * as exactDomRenderProgramRuntime from '@exactjs/dom/runtime/render-program';
import { flushSync } from '@exactjs/reactive';
import ts from 'typescript';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { readClientComponentInput } from '../../dom/src/renderer/component-input-admission.js';
import { transform } from './index.js';
describe('compiled transparent component', () => {
	it.each([
		['planned', 'onClick'],
		['receipt', 'onClick'],
		['receipt', 'onClickCapture'],
		['spread', 'onClick']
	])('updates callback props in a retained %s child through %s', (mode, event) => {
		const compiled = transform(
			`
function Button(props: { onClick?: () => void; label: string }) {
 return () => <button ${mode === 'receipt' ? 'test:flag="copy"' : mode === 'spread' ? '{...{title: "copy"}}' : ''} ${event}={props.onClick}>{props.label}</button>;
}
export function Page(props: { onClick?: () => void; label: string }) {
 return () => <section><Button onClick={props.onClick} label={props.label} /></section>;
}`,
			{ filename: 'CallbackProps.tsx', target: 'client' }
		);
		const Page = executeCompiledComponent(compiled, 'Page');
		const container = document.createElement('div');
		document.body.append(container);
		onTestFinished(() => {
			unmount(container);
			container.remove();
		});
		const first = vi.fn();
		const second = vi.fn();
		render(createTestOperation(Page, { onClick: first, label: 'first' }), container);
		flushSync();
		const button = container.querySelector('button')!;
		button.click();
		expect(first).toHaveBeenCalledOnce();
		render(createTestOperation(Page, { onClick: second, label: 'second' }), container);
		flushSync();
		expect(container.querySelector('button')).toBe(button);
		expect(button.textContent).toBe('second');
		button.click();
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
		render(createTestOperation(Page, { onClick: undefined, label: 'disabled' }), container);
		flushSync();
		button.click();
		expect(second).toHaveBeenCalledOnce();
		unmount(container);
		button.click();
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
	});
	it.each(['props.value', 'read()'])(
		'retains the output when setup derives its value from %s',
		(expression) => {
			const compiled = transform(
				`
import type { Component } from '@exactjs/core';
export function Page(this: Component<{}>, props: { value: string }) {
	${expression === 'read()' ? 'function read() { const value = props.value; return value; }' : ''}
	const value = ${expression};
	return () => <output>{value}</output>;
}`,
				{ filename: 'ScalarSetupProp.tsx', target: 'client' }
			);
			const Page = executeCompiledComponent(compiled, 'Page');
			const container = document.createElement('div');
			onTestFinished(() => unmount(container));
			const read = vi.fn();
			const update = (value: string) => {
				const props = {
					get value() {
						expect(this).toBe(props);
						read();
						return value;
					}
				};
				render(
					exactComponentOperationsRuntime.createCompiledComponentInputReceipt(Page, props),
					container
				);
				flushSync();
			};
			update('first');
			const output = container.querySelector('output');
			expect(output?.textContent).toBe('first');
			for (const value of ['second', 'third']) {
				update(value);
				expect(container.querySelector('output')).toBe(output);
				expect(output?.textContent).toBe(value);
			}
			expect(read).toHaveBeenCalledTimes(3);
			unmount(container);
			expect(container.querySelector('output')).toBeNull();
		}
	);
	it.each(['component', 'helper'])(
		'retains keyed rows from a shared projection in a %s',
		(owner) => {
			const compiled = transform(
				`
/** @exact pure */
function project(items: {id: string; label: string}[]) { return items.map(item => ({...item})); }
function Row(props: {id: string; label: string}) { return () => <span>{props.label}</span>; }
${owner === 'helper' ? 'function view' : 'export function Report'}(props: {items: {id: string; label: string}[]}) {
 const rows = project(props.items);
 return ${owner === 'helper' ? '' : '() => '}<section><p>{rows.length}</p>{rows.map(row => <Row key={row.id} {...row} />)}</section>;
}
${owner === 'helper' ? 'export function Report(props: {items: {id: string; label: string}[]}) { return () => view(props); }' : ''}`,
				{ filename: 'DerivedKeyedRows.tsx', target: 'client' }
			);
			const Report = executeCompiledComponent(compiled, 'Report');
			const container = document.createElement('div');
			onTestFinished(() => {
				unmount(container);
			});
			const update = (
				items: {
					id: string;
					label: string;
				}[]
			) => {
				render(createTestOperation(Report, { items }), container);
				flushSync();
			};
			update([
				{ id: 'a', label: 'first' },
				{ id: 'b', label: 'second' }
			]);
			const retained = container.querySelectorAll('span')[1];
			update([{ id: 'b', label: 'changed' }]);
			expect(container.querySelector('p')?.textContent).toBe('1');
			expect(container.querySelectorAll('span')).toHaveLength(1);
			expect(container.querySelector('span')).toBe(retained);
			expect(retained?.textContent).toBe('changed');
		}
	);
	it.each(['client', 'hydrate', 'complete'] as const)(
		'updates scalar helper arguments in the %s projection without remounting',
		(componentContractProjection) => {
			const compiled = transform(
				`
			import { type Component } from '@exactjs/core';
			function view(value: string, flag: boolean, state: { clicks: number }, click: () => void, observe: () => void) {
				observe();
				return <button onClick={click}>{value}:{String(flag)}:{state.clicks}</button>;
			}
			function Child(this: Component<{ clicks: number }>, props: { value: string; flag: boolean; observe: () => void; unrelated?: number }) {
				this.state.clicks = 0;
				return () => view(props.value, props.flag, this.state, () => this.state.clicks++, props.observe);
			}
			export function Page(props: { value: string; flag: boolean; observe: () => void; unrelated?: number }) {
				return () => <main><Child value={props.value} flag={props.flag} observe={props.observe} /><span>{props.unrelated}</span></main>;
			}
		`,
				{ filename: 'ScalarHelper.tsx', target: 'client', componentContractProjection }
			);
			const Page = executeCompiledComponent(compiled, 'Page');
			const container = document.createElement('div');
			onTestFinished(() => {
				unmount(container);
			});
			const observe = vi.fn();
			const update = (value: string, flag: boolean, unrelated = 0) => {
				render(createTestOperation(Page, { value, flag, observe, unrelated }), container);
				flushSync();
			};
			update('A', false);
			const button = container.querySelector('button')!;
			expect(button.textContent).toBe('A:false:0');
			button.click();
			flushSync();
			update('A', true);
			expect(button.textContent).toBe('A:true:1');
			update('B', true);
			expect(button.textContent).toBe('B:true:1');
			update('B', false);
			expect(button.textContent).toBe('B:false:1');
			// Replacement prop sources may reevaluate the helper to move its subscriptions.
			// An unrelated parent input must still leave that retained range alone.
			const callsAfterInputChanges = observe.mock.calls.length;
			update('B', false, 1);
			expect(observe).toHaveBeenCalledTimes(callsAfterInputChanges);
			expect(container.querySelector('button')).toBe(button);
		}
	);
	it('refreshes shared derived selections in a retained render helper', () => {
		const compiled = transform(
			`
			import { type Component } from '@exactjs/core';
			export function view(state: { items: { id: string; status: string }[]; selectedId: string }) {
				const selected = state.items.find(item => item.id === state.selectedId);
				const status = selected?.status ?? 'missing';
				return <main>{selected ? <section><strong>{status}</strong><span>{selected.status}</span></section> : <p>None</p>}</main>;
			}
			export function Page(this: Component<{ items: { id: string; status: string }[]; selectedId: string }>) {
				this.state.items = [{ id: 'a', status: 'open' }];
				this.state.selectedId = 'a';
				const close = () => { this.state.items = [{ id: 'a', status: 'closed' }]; };
				return () => <div><button onClick={close}>Close</button>{view(this.state)}</div>;
			}
		`,
			{ filename: 'DerivedSelection.tsx', target: 'client' }
		);
		const Page = executeCompiledComponent(compiled, 'Page');
		const container = document.createElement('div');
		try {
			render(createTestOperation(Page, {}), container);
			expect(container.querySelector('main')?.textContent).toBe('openopen');
			container.querySelector('button')!.click();
			flushSync();
			expect(container.querySelector('main')?.textContent).toBe('closedclosed');
		} finally {
			unmount(container);
		}
	});
	it('updates only its compiler-owned focused output range', () => {
		const source = `
			export function Transparent(props: { value: string }) {
				return () => props.value;
			}
		`;
		const compiled = transform(source, {
			filename: 'Transparent.tsx',
			target: 'client'
		});
		expect(compiled).toContain('abi: 1');
		expect(compiled).toContain('createCompiledChildRangeReceipt');
		expect(compiled).toContain('attachExactCompiledClientComponent');
		expect(compiled).not.toContain('createCompiledComponentOutput');
		const Transparent = executeCompiledComponent(compiled, 'Transparent');
		const container = document.createElement('div');
		render(createTestOperation(Transparent, { value: 'before' }), container);
		expect(container.textContent).toBe('before');
		const text = [...container.childNodes].find((node) => node instanceof Text);
		expect(text).toBeInstanceOf(Text);
		render(createTestOperation(Transparent, { value: 'after' }), container);
		flushSync();
		expect(container.textContent).toBe('after');
		expect([...container.childNodes].find((node) => node instanceof Text)).toBe(text);
		unmount(container);
	});
	it('publishes parent prop changes through the retained child artifact receipt', () => {
		const source = `
			function Child(props: { label: string }) {
				return () => <strong>{props.label}</strong>;
			}
			export function Page(props: { label: string }) {
				return () => <main><Child label={props.label} /></main>;
			}
		`;
		const compiled = transform(source, {
			filename: 'DirectChild.tsx',
			target: 'client'
		});
		expect(compiled).toContain('[[2, 0, [[0]], 1]]');
		expect(compiled).not.toContain('bindCompiledProgramComponent');
		expect(compiled).not.toContain('applyCompiledProgramChild');
		const Page = executeCompiledComponent(compiled, 'Page');
		const container = document.createElement('div');
		render(createTestOperation(Page, { label: 'before' }), container);
		const childRoot = container.querySelector('strong');
		expect(childRoot?.textContent).toBe('before');
		render(createTestOperation(Page, { label: 'after' }), container);
		flushSync();
		expect(container.querySelector('strong')).toBe(childRoot);
		expect(childRoot?.textContent).toBe('after');
		unmount(container);
	});
	it('does not duplicate a keyed component range projected by a received conditional prop', () => {
		const source = `
			import { type Component } from '@exactjs/core';
			function Range(props: { children?: unknown; onExited?: () => void }) {
				return () => props.children;
			}
			function projectRange(child: unknown, onExited: () => void) {
				return [<Range key="content" onExited={onExited}>{child}</Range>];
			}
			function Gate(this: Component<{ revision: number }>, props: { shown: boolean; children?: unknown }) {
				this.state.revision = 0;
				const invalidate = () => this.state.revision++;
				const render = () => {
					void this.state.revision;
					return props.shown ? projectRange(props.children, invalidate) : [];
				};
				return () => render();
			}
			export function Page(props: { shown: boolean }) {
				return () => <main><Gate shown={props.shown}><span className="content">ready</span></Gate></main>;
			}
		`;
		const compiled = transform(source, {
			filename: 'ConditionalComponentRange.tsx',
			target: 'client'
		});
		expect(compiled).not.toContain('bindCompiledProgramComponent');
		expect(compiled).toContain('createCompiledChildRangeReceipt');
		const Page = executeCompiledComponent(compiled, 'Page');
		const container = document.createElement('div');
		render(createTestOperation(Page, { shown: false }), container);
		expect(container.querySelectorAll('.content')).toHaveLength(0);
		render(createTestOperation(Page, { shown: true }), container);
		flushSync();
		expect(container.querySelectorAll('.content')).toHaveLength(1);
		render(createTestOperation(Page, { shown: true }), container);
		flushSync();
		expect(container.querySelectorAll('.content')).toHaveLength(1);
		unmount(container);
	});
});
function executeCompiledComponent(
	compiled: string,
	exportName: string
): exactCore.AnyComponentFunction {
	const javascript = ts.transpileModule(compiled, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	}).outputText;
	const module = { exports: {} as Record<string, exactCore.AnyComponentFunction> };
	const modules: Record<string, unknown> = {
		'@exactjs/core': exactCore,
		'@exactjs/core/runtime/collections': exactCollectionsRuntime,
		'@exactjs/core/runtime/lists': exactListsRuntime,
		'@exactjs/core/runtime/component-construction/render': exactRenderConstructionRuntime,
		'@exactjs/core/runtime/component-construction/durable': exactDurableConstructionRuntime,
		'@exactjs/core/runtime/component-abi': exactComponentAbiRuntime,
		'@exactjs/core/runtime/component-operations': exactComponentOperationsRuntime,
		'@exactjs/core/runtime/contexts': exactContextsRuntime,
		'@exactjs/core/runtime/refs': exactRefsRuntime,
		'@exactjs/core/runtime/render': exactRenderRuntime,
		'@exactjs/core/runtime/render-operations': exactRenderOperationsRuntime,
		'@exactjs/core/runtime/reactivity': exactReactivityRuntime,
		'@exactjs/core/runtime/tasks': exactTasksRuntime,
		'@exactjs/core/runtime/component-branding': exactComponentBrandingRuntime,
		'@exactjs/dom/runtime/direct-component': exactDomDirectComponentRuntime,
		'@exactjs/dom/runtime/render-program': exactDomRenderProgramRuntime
	};
	new Function('require', 'exports', 'module', javascript)(
		(specifier: string) => {
			if (specifier in modules) return modules[specifier];
			throw new Error(`Unexpected compiled test dependency ${specifier}`);
		},
		module.exports,
		module
	);
	const component = module.exports[exportName];
	if (!component) throw new Error(`Compiled fixture did not export ${exportName}`);
	return component;
}
it.each(['Map', 'ReadonlyMap'])('keeps inferred %s reads reactive through a helper', (mapType) => {
	const compiled = transform(
		`
import type { Component } from '@exactjs/core';
function label(values: ${mapType}<string,string>, timestamp:number) {
 return (values.get('key') ?? 'missing') + ':' + new Date(timestamp).getTime();
}
export function Page(this: Component<{values:Map<string,string>;timestamp:number}>) {
 this.state.values = new Map([['key','first']]);
 this.state.timestamp = 0;
 const text = label(this.state.values,this.state.timestamp);
 return ()=> <section><p>{text}</p>
 <button onClick={()=>{this.state.values.set('key','second');this.state.timestamp=1000;}}>change</button>
 <button onClick={()=>this.state.values.delete('key')}>remove</button>
 <button onClick={()=>this.state.values.set('key','third')}>restore</button>
 </section>;
}`,
		{ filename: 'DerivedMap.tsx', target: 'client' }
	);
	const Page = executeCompiledComponent(compiled, 'Page');
	const container = document.createElement('div');
	onTestFinished(() => {
		unmount(container);
	});
	render(createTestOperation(Page, {}), container);
	flushSync();
	const paragraph = container.querySelector('p')!;
	const buttons = container.querySelectorAll('button');
	expect(paragraph.textContent).toBe('first:0');
	buttons[0]!.click();
	flushSync();
	expect(container.querySelector('p')).toBe(paragraph);
	expect(paragraph.textContent).toBe('second:1000');
	buttons[1]!.click();
	flushSync();
	expect(paragraph.textContent).toBe('missing:1000');
	buttons[2]!.click();
	flushSync();
	expect(paragraph.textContent).toBe('third:1000');
	unmount(container);
	expect(container.childNodes).toHaveLength(0);
});
// Supplied children belong to the actual lexical instance even when Shell owns placement.
import { roots } from '../../dom/src/state.js';
import type { Mounted } from '../../dom/src/types.js';
import { receiveComponentReceipt } from '../../dom/src/renderer/mounting/native-component-artifact.js';
const supplierSource = `
import type {Child,Component} from '@exactjs/core';
function Shell(props:{value:number;children?:Child|Child[]}){return()=> <section>{props.children}</section>}
function Leaf(props:{value:number}){return()=> <b>{props.value}</b>}
export function Forwarded(this:Component<{count:number}>,props:{value:number}){
 this.state.count=0;return()=> <Shell {...props}><Leaf value={props.value+this.state.count}/></Shell>;
}`;
function mountSupplierPair() {
	const Supplier = executeCompiledComponent(
		transform(supplierSource, { filename: 'LexicalSupplier.tsx', target: 'client' }),
		'Forwarded'
	);
	const a = document.createElement('div'),
		b = document.createElement('div');
	onTestFinished(() => {
		unmount(a);
		unmount(b);
	});
	render(createTestOperation(Supplier, { value: 1 }), a);
	render(createTestOperation(Supplier, { value: 10 }), b);
	return {
		Supplier,
		a,
		b,
		ai: roots.get(a)!.mounted!.instance!,
		bi: roots.get(b)!.mounted!.instance!
	};
}
function suppliedLeaf(mounted: Mounted): Mounted | undefined {
	if (mounted.instance?.type.name === 'Leaf') return mounted;
	for (const child of mounted.children ?? []) {
		const found = suppliedLeaf(child);
		if (found) return found;
	}
}
it('keeps supplied child props, state, identity and lifetime with each actual supplier instance', () => {
	const { Supplier, a, b, ai, bi } = mountSupplierPair();
	const an = a.querySelector('b'),
		bn = b.querySelector('b');
	expect(an).not.toBeNull();
	expect(bn).not.toBeNull();
	ai.state.count = 1;
	flushSync();
	expect(ai.state.count).toBe(1);
	expect(bi.state.count).toBe(0);
	expect(a.textContent).toBe('2');
	expect(b.textContent).toBe('10');
	expect(a.querySelector('b')).toBe(an);
	render(createTestOperation(Supplier, { value: 4 }), a);
	expect(a.textContent).toBe('5');
	expect(a.querySelector('b')).toBe(an);
	expect(ai.state.count).toBe(1);
	bi.state.count = 2;
	flushSync();
	expect(b.textContent).toBe('12');
	expect(b.querySelector('b')).toBe(bn);
	unmount(a);
	expect(ai.scope.active).toBe(false);
	bi.state.count = 3;
	flushSync();
	expect(b.textContent).toBe('13');
	expect(b.querySelector('b')).toBe(bn);
});
it('commits exact supplier handoffs transactionally across failure, reentrancy and disposal', () => {
	const { a, b, ai, bi } = mountSupplierPair();
	const am = suppliedLeaf(roots.get(a)!.mounted!)!,
		bm = suppliedLeaf(roots.get(b)!.mounted!)!;
	const issued = bm.componentReceipt!,
		update = issued.update!,
		type = am.instance!.type;
	const node = a.querySelector('b');
	expect(update.owner).toBe(bi);
	expect(update.owner).not.toBe(ai);
	const receipt = (value: unknown) =>
		readClientComponentInput(
			exactComponentOperationsRuntime.createCompiledComponentInputReceipt(type, { value })
		)!;
	const observed = (read: () => unknown) =>
		readClientComponentInput(
			exactComponentOperationsRuntime.withCompiledComponentReceiptUpdate(
				exactComponentOperationsRuntime.createCompiledComponentInputReceipt(type, {
					value: exactRenderOperationsRuntime.createComponentPropExpression(read)
				}),
				update.target,
				update.contract,
				update.owner
			)
		)!;
	let caught = false;
	try {
		receiveComponentReceipt(
			am,
			observed(() => {
				throw 0;
			})
		);
	} catch (error) {
		caught = true;
		expect(error).toBe(0);
	}
	expect(caught).toBe(true);
	ai.state.count = 1;
	flushSync();
	expect(a.textContent).toBe('2');
	receiveComponentReceipt(am, issued);
	// Direct internal delivery queues reactive DOM work outside the public render flush.
	flushSync();
	expect(a.textContent).toBe('10');
	ai.state.count = 2;
	flushSync();
	expect(a.textContent).toBe('10');
	bi.state.count = 1;
	flushSync();
	expect(a.textContent).toBe('11');
	expect(a.querySelector('b')).toBe(node);
	const inner = receipt(5);
	receiveComponentReceipt(
		am,
		observed(() => {
			receiveComponentReceipt(am, inner);
			return 99;
		})
	);
	flushSync();
	// Admission recipes are fresh views. The committed issued operation keeps exact identity.
	expect(am.componentReceipt?.admitted.operation).toBe(inner.admitted.operation);
	expect(a.textContent).toBe('5');
	bi.state.count = 2;
	flushSync();
	expect(a.textContent).toBe('5');
	expect(b.textContent).toBe('12');
	receiveComponentReceipt(
		am,
		observed(() => {
			unmount(a);
			return 99;
		})
	);
	expect(a.childNodes).toHaveLength(0);
	expect(am.componentReceiptBinding?.current).toBeUndefined();
	bi.state.count = 3;
	flushSync();
	expect(b.textContent).toBe('13');
	expect(a.childNodes).toHaveLength(0);
});
