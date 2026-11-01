import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import {
	captureTaskPropertyMutations,
	discardTaskPropertyMutations,
	takeTaskPropertyMutations
} from '../../../core/src/tasks/property-mutations.js';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

type OwnedEntry = (signal: AbortSignal, receiver: unknown, args: unknown[]) => unknown;

/** Exercises compiler output independently of call-site routing and HTTP projection. */
async function compileHelper(source: string) {
	const root = await createCompilerTestWorkspace('.exact-owned-execution-', process.cwd());
	const files = await writeTestFiles(root, { 'helper.ts': source });
	const [artifact] = await compileProjectArtifacts([files['helper.ts']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const module = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const entries = Object.entries(module).filter(([name]) => name.startsWith('__exact_owned_'));
	expect(entries).toHaveLength(1);
	return { module, entry: entries[0]![1] as OwnedEntry };
}

it('keeps compiled helper owners lexical across suspension, cancellation, and raw alias return', async () => {
	const { entry } = await compileHelper(
		`export async function apply(state:{value:string},gate:Promise<void>,value:string){await gate;state.value=value;return state;}`
	);
	const first = new AbortController(),
		second = new AbortController(),
		cancelled = new AbortController();
	const controllers = [first, second, cancelled];
	for (const controller of controllers) captureTaskPropertyMutations(controller.signal);
	onTestFinished(() => {
		for (const controller of controllers) discardTaskPropertyMutations(controller.signal);
	});
	let releaseFirst!: () => void, releaseSecond!: () => void, releaseCancelled!: () => void;
	const one = { value: 'one' },
		two = { value: 'two' },
		old = { value: 'old' };
	const firstResult = entry(first.signal, undefined, [
		one,
		new Promise<void>((resolve) => {
			releaseFirst = resolve;
		}),
		'first'
	]) as Promise<unknown>;
	const secondResult = entry(second.signal, undefined, [
		two,
		new Promise<void>((resolve) => {
			releaseSecond = resolve;
		}),
		'second'
	]) as Promise<unknown>;
	const cancelledResult = (
		entry(cancelled.signal, undefined, [
			old,
			new Promise<void>((resolve) => {
				releaseCancelled = resolve;
			}),
			'late'
		]) as Promise<unknown>
	).catch((error) => error);
	cancelled.abort();
	releaseSecond();
	expect(await secondResult).toBe(two);
	const secondEvidence = takeTaskPropertyMutations(second.signal)!;
	expect(secondEvidence(two, 'value')).toBe('set');
	expect(secondEvidence(one, 'value')).toBeUndefined();
	releaseFirst();
	expect(await firstResult).toBe(one);
	const firstEvidence = takeTaskPropertyMutations(first.signal)!;
	expect(firstEvidence(one, 'value')).toBe('set');
	expect(firstEvidence(two, 'value')).toBeUndefined();
	releaseCancelled();
	expect(await cancelledResult).toMatchObject({ name: 'AbortError' });
	expect(old.value).toBe('old');
	expect(takeTaskPropertyMutations(cancelled.signal)).toBeUndefined();
	// Raw aliases remain ordinary readable objects after capture transfer.
	expect(one.value).toBe('first');
	expect(two.value).toBe('second');
	captureTaskPropertyMutations(first.signal);
	const following = { value: 'before' };
	expect(await entry(first.signal, undefined, [following, Promise.resolve(), 'following'])).toBe(
		following
	);
	expect(takeTaskPropertyMutations(first.signal)!(following, 'value')).toBe('set');
	expect(takeTaskPropertyMutations(first.signal)).toBeUndefined();
});

it('preserves original callable values, native call/apply selection, and array-like argument order', async () => {
	const { module, entry } = await compileHelper(`
 export function apply(this:{suffix:string},state:{value:string},value='after',...rest:string[]){if(arguments.length!==2||rest.length!==0)throw new Error('arguments');state.value=value+this.suffix;return apply;}
 export const original=apply;
 export function selectedCall(state:{value:string}){const f=Object.assign(apply,{call(_receiver:unknown,selected:{value:string}){selected.value='override';return 7;}});return f.call(undefined,state);}
 export function arrayLike(state:{value:string},trace:string[]){return Function.prototype.apply.call(apply,{suffix:'!'}, {get length(){trace.push('length');return 2;},get 0(){trace.push('0');return state;},get 1(){trace.push('1');return 'array';}});}
 `);
	const original = module.original as { name: string; length: number; prototype: object };
	expect(module.apply).toBe(original);
	expect(original.name).toBe('apply');
	expect(original.length).toBe(1);
	expect(original.prototype).toBeDefined();
	const controller = new AbortController();
	captureTaskPropertyMutations(controller.signal);
	onTestFinished(() => discardTaskPropertyMutations(controller.signal));
	const state = { value: 'before' };
	expect(entry(controller.signal, { suffix: '!' }, [state, 'owned'])).toBe(original);
	expect(state.value).toBe('owned!');
	const fixed = Object.freeze({ value: 'fixed' });
	expect(() => entry(controller.signal, { suffix: '!' }, [fixed, 'failure'])).toThrow(TypeError);
	let setterReceiver: unknown;
	const inherited = Object.create({
		set value(value: string) {
			setterReceiver = this;
			Object.defineProperty(this, 'stored', { value });
		}
	}) as { value: string; stored: string };
	entry(controller.signal, { suffix: '!' }, [inherited, 'setter']);
	expect(setterReceiver).toBe(inherited);
	expect(inherited.stored).toBe('setter!');
	expect(takeTaskPropertyMutations(controller.signal)!(state, 'value')).toBe('set');
	const selected = { value: 'before' };
	expect((module.selectedCall as (state: unknown) => number)(selected)).toBe(7);
	expect(selected.value).toBe('override');
	const trace: string[] = [];
	expect((module.arrayLike as (state: unknown, trace: string[]) => unknown)(state, trace)).toBe(
		original
	);
	expect(trace).toEqual(['length', '0', '1']);
	expect(state.value).toBe('array!');
});

it('retains the selected helper receiver across an awaited replacement', async () => {
	const { entry } = await compileHelper(
		`export async function apply(state:{left:{value:string}},gate:Promise<string>){const old=state.left;state.left.value=await gate;return [old,state.left];}`
	);
	const controller = new AbortController();
	captureTaskPropertyMutations(controller.signal);
	onTestFinished(() => discardTaskPropertyMutations(controller.signal));
	let release!: (value: string) => void;
	const old = { value: 'before' },
		replacement = { value: 'replacement' },
		state = { left: old };
	const pending = entry(controller.signal, undefined, [
		state,
		new Promise<string>((resolve) => {
			release = resolve;
		})
	]) as Promise<unknown>;
	state.left = replacement;
	release('old-write');
	expect(await pending).toEqual([old, replacement]);
	expect(old.value).toBe('old-write');
	expect(state.left).toBe(replacement);
	expect(replacement.value).toBe('replacement');
	const evidence = takeTaskPropertyMutations(controller.signal)!;
	expect(evidence(old, 'value')).toBe('set');
	expect(evidence(replacement, 'value')).toBeUndefined();
});

it('uses the invocation intrinsic while preserving an authored Reflect capture', async () => {
	const { module, entry } = await compileHelper(
		`const Reflect={apply(...args:unknown[]){void args;throw new Error('authored Reflect must stay a capture');}};export const originalCapture=Reflect;export function apply(state:{value:string}){state.value='after';return Reflect;}`
	);
	const controller = new AbortController();
	captureTaskPropertyMutations(controller.signal);
	onTestFinished(() => discardTaskPropertyMutations(controller.signal));
	const state = { value: 'before' };
	expect(entry(controller.signal, undefined, [state])).toBe(module.originalCapture);
	expect(state.value).toBe('after');
	expect(takeTaskPropertyMutations(controller.signal)!(state, 'value')).toBe('set');
});
