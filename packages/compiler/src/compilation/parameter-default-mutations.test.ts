import { expect, it, vi } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const cases = [
	[
		'reported browser default',
		'const Number=(a=0,b=(a=1))=>a;const obj={item:{value:"safe"}};if(Number())obj.item={get value(){return document.title}};export const value=obj.item.value;',
		'browser',
		true
	],
	['bare default assignment', 'const work=(a=0,b=(a=1))=>a;export const value=work();', 1, true],
	['earlier formal read', 'const work=(a=0,b=a)=>b;export const value=work();', 0, false],
	[
		'body binding assignment',
		'const work=(a=0,b=0)=>{a=1;return a};export const value=work();',
		1,
		true
	],
	[
		'member default assignment',
		'const work=(a={value:0},b=(a.value=1))=>a.value;export const value=work();',
		1,
		true
	],
	[
		'native assignment with nested member default',
		'const work=(a={value:0},b=0,c=(b=(a.value=1)))=>a.value+b;export const value=work();',
		2,
		true
	]
] as const;

for (const target of ['client', 'server'] as const) {
	for (const [name, source, value, owned] of cases) {
		it(`preserves ${name} and the complete namespace (${target})`, async () => {
			const effects: string[] = [];
			vi.stubGlobal('document', {
				get title() {
					effects.push('title');
					return 'browser';
				}
			});
			try {
				const { compiled } = await privateHelperArtifact(
					source + 'export const stable="safe";',
					target
				);
				const helpers = Object.keys(compiled).filter((key) => key.startsWith('__exact_owned_'));
				expect(helpers).toHaveLength(target === 'server' && owned ? 1 : 0);
				for (const key of helpers) {
					expect(typeof compiled[key]).toBe('function');
					if (typeof value === 'number') {
						const entry = compiled[key] as (
							signal: AbortSignal,
							receiver: unknown,
							args: unknown[]
						) => unknown;
						expect(entry(new AbortController().signal, undefined, [])).toBe(value);
					}
				}
				const available = target === 'client' || value !== 'browser';
				expect(Object.keys(compiled).sort()).toEqual(
					[...helpers, 'stable', ...(available ? ['value'] : [])].sort()
				);
				expect(compiled.stable).toBe('safe');
				if (available) expect(compiled.value).toBe(value);
				// The helper loads the authored control too, so only CLIENT imports observe title twice.
				expect(effects).toEqual(
					value === 'browser' ? (target === 'client' ? ['title', 'title'] : ['title']) : []
				);
			} finally {
				vi.unstubAllGlobals();
			}
		});
	}

	it(`preserves repeated, skipped and abrupt member defaults through owned invocation (${target})`, async () => {
		const source =
			'export const work=(owner:{child:{value:number};trace:string},value=(owner.child["value"]=(owner.trace+="R",1)))=>value;export const stable="safe";';
		const { compiled, authored } = await privateHelperArtifact(source, target);
		const helpers = Object.keys(compiled).filter((key) => key.startsWith('__exact_owned_'));
		expect(Object.keys(compiled).sort()).toEqual([...helpers, 'work', 'stable'].sort());
		expect(helpers).toHaveLength(target === 'server' ? 1 : 0);
		const execute = (invoke: (owner: object, ...args: number[]) => unknown) => {
			const events: string[] = [];
			let trace = '',
				fail = false;
			const child = new Proxy(
				{ value: 0 },
				{
					set(object, key, value) {
						events.push(`put:${String(key)}:${value}`);
						return Reflect.set(object, key, value);
					}
				}
			);
			const owner = {
				get child() {
					events.push('receiver');
					return child;
				},
				get trace() {
					events.push('rhs-read');
					if (fail) throw new Error('rhs');
					return trace;
				},
				set trace(value: string) {
					events.push(`rhs-write:${value}`);
					trace = value;
				}
			};
			const runs: unknown[] = [];
			for (const mode of ['first', 'skip', 'repeat', 'abrupt', 'recover']) {
				fail = mode === 'abrupt';
				const start = events.length;
				try {
					runs.push({
						value: mode === 'skip' ? invoke(owner, 9) : invoke(owner),
						events: events.slice(start)
					});
				} catch (error) {
					runs.push({ error: (error as Error).message, events: events.slice(start) });
				}
			}
			return { runs, value: child.value, trace };
		};
		const expected = execute(authored.work as (owner: object, ...args: number[]) => unknown);
		expect(expected).toEqual({
			runs: [
				{ value: 1, events: ['receiver', 'rhs-read', 'rhs-write:R', 'put:value:1'] },
				{ value: 9, events: [] },
				{ value: 1, events: ['receiver', 'rhs-read', 'rhs-write:RR', 'put:value:1'] },
				{ error: 'rhs', events: ['receiver', 'rhs-read'] },
				{ value: 1, events: ['receiver', 'rhs-read', 'rhs-write:RRR', 'put:value:1'] }
			],
			value: 1,
			trace: 'RRR'
		});
		expect(execute(compiled.work as (owner: object, ...args: number[]) => unknown)).toEqual(
			expected
		);
		if (target === 'server') {
			const entry = compiled[helpers[0]!] as (
				signal: AbortSignal,
				receiver: unknown,
				args: unknown[]
			) => unknown;
			expect(
				execute((owner, ...args) =>
					entry(new AbortController().signal, undefined, [owner, ...args])
				)
			).toEqual(expected);
		}
	});
}
