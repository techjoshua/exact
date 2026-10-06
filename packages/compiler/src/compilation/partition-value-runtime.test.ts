import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each([
	`const browser=window.innerWidth;console.log(browser);export {browser as width};export const stable=1;`,
	`function h0(){return window.innerWidth;}${Array.from({ length: 28 }, (_, index) => `function h${index + 1}(){return h${index}()+h${index}();}`).join('')}export const width=h28;export const stable=1;`,
	`export const {innerWidth:width}=window;export const stable=1;`,
	`export default window.innerWidth;export const stable=1;`,
	`const browser=window.innerWidth;const alias=browser;export {alias as width};export const stable=1;`,
	`const browser=window.innerWidth;export const width=()=>browser;export const stable=1;`,
	`export function width(){return window.innerWidth}export const stable=1;`,
	`let stable=0;if(typeof window!=='undefined'){const browser=window.innerWidth;stable=browser;}else{stable=1;}export{stable};`
])(
	'evaluates a partitioned server value module without browser initialization (%s)',
	async (source) => {
		const root = await createTestWorkspace('.exact-partition-values-', process.cwd());
		const entry = path.join(root, 'values.ts');
		await writeFile(entry, source);
		const artifacts = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const values = artifacts.find((artifact) => artifact.inputFile === entry)!;
		// This test runs in Node, where evaluating any retained browser initializer would throw.
		const server = await importArtifact(values.serverFile, path.join(root, 'server.mjs'));
		expect({ ...server }).toEqual({ stable: 1 });
	}
);

it('keeps foreign re-export ownership distinct from an opposite-runtime local alias', async () => {
	const root = await createTestWorkspace('.exact-partition-reexport-', process.cwd());
	const entry = path.join(root, 'values.ts');
	const foreign = path.join(root, 'foreign.ts');
	await writeFile(foreign, `export const browser='foreign-shared';`);
	await writeFile(
		entry,
		`const browser=window.innerWidth;export {browser as width};export {browser as stable} from './foreign.js';`
	);
	const artifacts = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const values = artifacts.find((artifact) => artifact.inputFile === entry)!;
	const server = await importArtifact(values.serverFile, path.join(root, 'server.mjs'));
	expect({ ...server }).toEqual({ stable: 'foreign-shared' });
});

it('links loaded re-exports while preserving portable event dispatch', async () => {
	const root = await createTestWorkspace('.exact-partition-barrel-', process.cwd());
	const entry = path.join(root, 'index.tsx');
	await writeFile(
		path.join(root, 'values.ts'),
		`export const browser=window.innerWidth;export default window.innerWidth;export function Same(){return window.innerWidth;}
export function withDefault(value=window.innerWidth){return value;}
export const target=new EventTarget();
type SharedTarget=EventTarget;
export function dispatch(value:Readonly<SharedTarget>=target){return value.dispatchEvent(new Event('probe'));}
export const stable=1;`
	);
	await writeFile(
		entry,
		`function Same(){return()=> <p/>;}export {Same as shadowWidth,browser as width,default as defaultWidth,withDefault,target,dispatch,stable} from './values.js';`
	);
	// Ordinary .ts value modules must be explicit artifact inputs. Automatic expansion owns JSX dependencies.
	const artifacts = await compileProjectArtifacts([entry, path.join(root, 'values.ts')], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const barrel = artifacts.find((artifact) => artifact.inputFile === entry)!;
	const server = await importArtifact(barrel.serverFile, path.join(root, 'server.mjs'));
	expect(Object.keys(server).sort()).toEqual(['dispatch', 'stable', 'target']);
	let received = 0;
	(server.target as EventTarget).addEventListener('probe', () => received++);
	expect((server.dispatch as () => boolean)()).toBe(true);
	expect((server.dispatch as () => boolean)()).toBe(true);
	expect(received).toBe(2);
});

it('preserves portable readonly event methods while partitioning inherited DOM methods', async () => {
	const root = await createTestWorkspace('.exact-partition-receiver-views-', process.cwd());
	const entry = path.join(root, 'views.ts');
	await writeFile(
		entry,
		`type Target=EventTarget;type Button=HTMLButtonElement;
export function dispatch(target:Readonly<Target>){return target.dispatchEvent(new Event('probe'));}
export function focus(button:Readonly<Button>){button.focus();}`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact.serverFile, path.join(root, 'server.mjs'));
	const client = await importArtifact(artifact.clientFile, path.join(root, 'client.mjs'));
	expect(Object.keys(server)).toEqual(['dispatch']);
	expect(Object.keys(client).sort()).toEqual(['dispatch', 'focus']);
	const target = new EventTarget();
	let received = 0;
	target.addEventListener('probe', () => received++);
	for (const module of [server, client]) {
		expect((module.dispatch as (target: EventTarget) => boolean)(target)).toBe(true);
		expect((module.dispatch as (target: EventTarget) => boolean)(target)).toBe(true);
	}
	expect(received).toBe(4);
	let focused = 0;
	const button = { focus: () => focused++ };
	(client.focus as (value: typeof button) => void)(button);
	(client.focus as (value: typeof button) => void)(button);
	expect(focused).toBe(2);
});
