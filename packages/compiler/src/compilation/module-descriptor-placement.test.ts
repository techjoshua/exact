/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished, vi } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

const storedCallback =
	'Object.defineProperty({value:()=>"before"},"value",{value:()=>document.title})';
const createdCallback =
	'Object.defineProperty(Object.create(null),"value",{value:()=>document.title})';
const definitionMap = (entry: string) => `Object.defineProperties({value:"before"},{${entry}})`;

const inheritedBrowser = 'Object.create({get inherited(){return document.title}})';
const definedPrototype = `const record = Object.defineProperty(${inheritedBrowser}, 'label', {value:'ready'});`;
const descriptorWithEagerGetter = `const record = Object.defineProperty({value:()=>''}, 'value', {
	get enumerable(){return true}, value:()=>document.title
});`;

it.each([
	{
		name: 'a frozen defined Symbol field beside independent stores',
		declaration: `const key = Symbol.for('module-key');
		const record = Object.freeze(Object.defineProperties(
			{tag:false, [key]:0, callback:()=>''},
			{tag:{value:true}, [key]:{value:7}, callback:{value:()=>document.title}}
		));
		const first = new WeakMap<object,unknown>();
		const second = new WeakMap<object,unknown>();
		const owner = {};
		function acquired(){return record}`,
		value: `[acquired() === record, Object.isFrozen(record), record.tag, record[key],
			typeof record.callback, first !== second, first.get(owner), second.has(owner)].map(String).join(':')`,
		expected: 'true:true:true:7:function:true:undefined:false'
	},
	{
		name: 'a frozen defined record holding its other getter',
		declaration: `const key = 'other';
		const record = Object.freeze(Object.defineProperties(
			{value:'before', get [key](){return document.title}},
			{value:{value:'ready'}}
		));`,
		value: 'record.value',
		expected: 'ready'
	},
	{
		name: 'a frozen defined record reading its other getter',
		declaration: `const key = 'other';
		const record = Object.freeze(Object.defineProperties(
			{value:'before', get [key](){return document.title}},
			{value:{value:'ready'}}
		));`,
		value: 'record.other',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a module Create target with a reached inherited getter',
		declaration: `const record = ${inheritedBrowser};`,
		value: 'record.inherited',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a defined Create target with a reached inherited getter',
		declaration: definedPrototype,
		value: 'record.inherited',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a defined Create target holding an inherited getter',
		declaration: definedPrototype,
		value: 'record.label',
		expected: 'ready'
	},
	{
		name: 'an own definition ahead of its inherited getter',
		declaration: `const record = Object.defineProperty(${inheritedBrowser}, 'inherited', {value:'ready'});`,
		value: 'record.inherited',
		expected: 'ready'
	},
	{
		name: 'an installed getter on the literal Create target',
		declaration: `const record = Object.defineProperty(Object.create({get inherited(){return 'held'}}), 'value', {get:()=>document.title});`,
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a defined Create target with a portable inherited getter',
		declaration: `const record = Object.defineProperty(Object.create({get inherited(){return 'portable'}}), 'label', {value:'ready'});`,
		value: 'record.inherited',
		expected: 'portable'
	},
	{
		name: 'an inherited getter reading the actual defined target',
		declaration: `const record = Object.defineProperty(
			Object.create({ get inherited(){return (this as unknown as {label:()=>string}).label()} }),
			'label', {value:()=>document.title}
		);`,
		value: 'record.inherited',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'an authored constructor and descriptor method',
		declaration: `const Object = {
			create(_prototype:object) { return {inherited:'authored'}; },
			defineProperty(target:{inherited:string}, _key:string, _descriptor:PropertyDescriptor) { return target; }
		};
		const record = Object.defineProperty(${inheritedBrowser}, 'label', {value:'ready'});`,
		value: 'record.inherited',
		expected: 'authored'
	},
	{
		name: 'a data value with the same key as the descriptor field',
		declaration: 'const record = Object.defineProperty({value:"before"},"value",{value:"ready"});',
		value: 'record.value',
		expected: 'ready'
	},
	{
		name: 'an empty descriptor',
		declaration: 'const record = Object.defineProperty({value:"ready"},"other",{});',
		value: 'record.value',
		expected: 'ready'
	},
	{
		name: 'the original Reflect result',
		declaration: 'const installed = Reflect.defineProperty({},"value",{value:"ready"});',
		value: 'String(installed)',
		expected: 'true'
	},
	{
		name: 'a stored browser callback',
		declaration: `const record = ${storedCallback};`,
		value: 'typeof record.value',
		expected: 'function'
	},
	{
		name: 'an invoked browser callback',
		declaration: `const record = ${storedCallback};`,
		value: 'record.value()',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a reached installed getter',
		declaration:
			'const record = Object.defineProperty({value:"before"},"value",{get:()=>document.title});',
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'an eager neutral descriptor getter',
		declaration:
			'const record = Object.defineProperty({value:"before"},"value",{get value(){return "ready"}});',
		value: 'record.value',
		expected: 'ready'
	},
	{
		name: 'a stored callback invoked after an eager descriptor field read',
		declaration: descriptorWithEagerGetter,
		value: 'record.value()',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a stored callback held after an eager descriptor field read',
		declaration: descriptorWithEagerGetter,
		value: 'typeof record.value',
		expected: 'function'
	},
	{
		name: 'an eager browser descriptor getter',
		declaration:
			'const record = Object.defineProperty({value:"before"},"value",{get value(){return document ? "browser value" : "missing"}});',
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'an eager browser descriptor getter before the Reflect result',
		declaration:
			'const installed = Reflect.defineProperty({},"value",{get value(){return document ? 1 : 0}});',
		value: 'String(installed)',
		browser: true,
		expected: 'true'
	},
	{
		name: 'a data descriptor on a fresh null-prototype target',
		declaration:
			'const record = Object.defineProperty(Object.create(null),"value",{value:"created"});',
		value: 'record.value',
		expected: 'created'
	},
	{
		name: 'a stored callback on a fresh null-prototype target',
		declaration: `const record = ${createdCallback};`,
		value: 'typeof record.value',
		expected: 'function'
	},
	{
		name: 'an invoked callback on a fresh null-prototype target',
		declaration: `const record = ${createdCallback};`,
		value: 'record.value()',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a reached installed getter on a fresh null-prototype target',
		declaration:
			'const record = Object.defineProperty(Object.create(null),"value",{get:()=>document.title});',
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a portable descriptor-map getter',
		declaration: `const record=${definitionMap('get value(){return {value:"ready"}}')};`,
		value: 'record.value',
		expected: 'ready'
	},
	{
		name: 'a stored descriptor-map callback',
		declaration: `const record=${definitionMap('value:{value:()=>document.title}')};`,
		value: 'typeof record.value',
		expected: 'function'
	},
	{
		name: 'an eager descriptor-map getter',
		declaration: `const record=${definitionMap('get value(){return {value:document.title}}')};`,
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a getter on the original descriptor field',
		declaration: `const record=${definitionMap('value:{get value(){return document.title}}')};`,
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a computed map getter returning a descriptor with its own getter',
		declaration: `const key="value" as const;const record=${definitionMap('get [key](){return {get value(){return document.title}}}')};`,
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'an authored Object replacement',
		declaration: `const Object = {defineProperty(_target: object, _key: string, descriptor: {value: string}) {
			return {value: descriptor.value + ' replacement'};
		}};
		const record = Object.defineProperty({},'value',{value:'authored'});`,
		value: 'record.value',
		expected: 'authored replacement'
	}
])('preserves module descriptor placement for $name', async (test) => {
	const root = await createCompilerTestWorkspace('.exact-module-descriptor-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`${test.declaration}\nexport function Page() { return () => <p>{${test.value}}</p>; }`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});

	const priorTitle = document.title;
	document.title = 'browser value';
	onTestFinished(() => {
		document.title = priorTitle;
	});
	let html: string;
	vi.stubGlobal('document', undefined);
	try {
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		({ html } = await renderToString(receipt(server.Page as never, {}), { markers: false }));
	} finally {
		vi.unstubAllGlobals();
	}
	if (test.browser) expect(html).toContain('data-exact-client-boundary=');
	else expect(html).toBe(`<p>${test.expected}</p>`);

	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => unmount(host));
	const errors: unknown[] = [];
	render(receipt(client.Page as never, {}), host, {
		onErrorReport: (report) => errors.push(report.error)
	});
	expect(errors).toEqual([]);
	expect(host.textContent).toBe(test.expected);
});

it.each([
	{
		name: 'a frozen defined record with an opaque computed key coercion',
		declaration: `const key = {[Symbol.toPrimitive](){document.title;return 'other'}} as unknown as string;
		const record = Object.freeze(Object.defineProperties({[key]:0,value:'before'},{value:{value:'ready'}}));`,
		value: 'record.value'
	},
	{
		name: 'an unknown module receiver',
		declaration: `declare function foreign(): object;
		const record = Object.defineProperty(foreign(), 'value', {value: 'ready'});`,
		value: 'typeof record'
	},
	{
		name: 'an aliased Create binding',
		declaration: `${definedPrototype}\nconst saved = record;`,
		value: 'saved.inherited'
	},
	{
		name: 'a getter on a further prototype',
		declaration: `const record = Object.defineProperty(
			Object.create({__proto__:{get inherited(){return document.title}}}), 'label', {value:'ready'}
		);`,
		value: 'record.inherited'
	},
	{
		name: 'an eager getter that changes its descriptor',
		declaration: `const record = Object.defineProperty({value:'before'}, 'value', {
			writable:false, get value(){this.writable=true; return 'ready'}
		});`,
		value: 'record.value'
	},
	{
		name: 'an eager getter with an unresolved call',
		declaration: `declare function foreign(): void;
		const record = Object.defineProperty({value:'before'}, 'value', {
			get value(){document; foreign(); return 'ready'}
		});`,
		value: 'record.value'
	}
])('requires module descriptor placement evidence for $name', async ({ declaration, value }) => {
	const root = await createCompilerTestWorkspace('.exact-module-descriptor-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`${declaration}\nexport function Page() { return () => <p>{${value}}</p>; }`
	);
	await expect(
		compileProjectArtifacts([entry], { rootDir: root, outDir: path.join(root, 'generated') })
	).rejects.toThrow('EXACT2101');
});

it('refuses explicit server execution of an eager browser descriptor-map getter', async () => {
	const root = await createCompilerTestWorkspace('.exact-task-descriptor-map-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{label:string}>) {
	this.state.label="initial";
	const run=(task:TaskContext=TaskContext.server().blocking())=>{
		void task;
		const record=${definitionMap('get value(){return {value:document.title}}')};
		this.state.label=record.value;
	};
	run();
	return()=> <output>{this.state.label}</output>;
}`
	);
	await expect(
		compileProjectArtifacts([entry], { rootDir: root, outDir: path.join(root, 'generated') })
	).rejects.toThrow(/EXACT2001.*references browser-only globals/);
});
