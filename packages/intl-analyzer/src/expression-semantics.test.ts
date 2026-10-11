/// <reference lib="es2023.intl" />
import { afterAll, expect, it } from 'vitest';
import type { Child } from '@exactjs/core';
import { createIntlEnvironment, type AnalyzedMessageDescriptorV1 } from '@exactjs/intl';
import { prepareIntlActivation, renderIntlActivation } from '@exactjs/intl/internal';
import { NativeIntlAnalyzer } from './native-analysis.js';

const analyzer = new NativeIntlAnalyzer();
afterAll(() => analyzer.dispose());
const options = { filename: '/src/Comparisons.tsx', owner: 'example', sourceLocale: 'en-US' };

it.each([
	['number | string', 'value === 1', [1, '1', 2, '2']],
	['number | string', "value === '1'", [1, '1', 2, '2']],
	['number | string', 'value == 1', [1, '1', 0, '']],
	['boolean | number', 'value == false', [false, 0, true, 1]],
	['unknown', "value === 'one'", ['one', 'other', 1, null]],
	['any', 'value === 1', [1, '1', 2, null]],
	['number', 'value === 1', [1, 2, 0, 21]],
	['string', "value === 'one'", ['one', 'other', '1', '']],
	['number', "value === 1 ? 'st' : value === 1", [1, 2, 0, 21]],
	['number | string', "value === 1 ? 'st' : value === 2", [1, '1', 2, '2']]
] as const)('preserves native comparison results for %s: %s', (type, condition, inputs) => {
	const expression = condition.includes('?')
		? `${condition} ? 'nd' : 'th'`
		: `${condition} ? 'yes' : 'no'`;
	const source = `export function Page(value:${type}) {return()=> <p intl:message>{${expression}}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const readers = native.regions[0]!.values.map(
		({ start, length }) => new Function('value', `return (${source.slice(start, start + length)});`)
	);
	const expected = new Function('value', `return (${expression});`);
	const environment = createIntlEnvironment({ locale: 'en-US' });
	for (const value of inputs) {
		const activation = prepareIntlActivation(
			runtimeDescriptor(result.descriptors[0]!),
			readers.map((read) => read(value))
		);
		expect(renderIntlActivation(activation, environment).join('')).toBe(expected(value));
	}
});

it.each(['Date', 'Duration', 'Instant'])(
	'preserves the authored formatter on a custom %s',
	(name) => {
		const method = name === 'Date' ? 'toLocaleDateString' : 'toLocaleString';
		const source = `class ${name}{${method}(){return 'authored'}} export function Page(value:${name}){return()=> <p intl:message>{value.${method}()}</p>;}`;
		const native = analyzer.analyze(source, options);
		const result = analyzer.analyzeSource(source, options);
		expect(result.diagnostics).toEqual([]);
		const value = { [method]: () => 'authored' };
		const values = native.regions[0]!.values.map(({ start, length }) =>
			new Function('value', `return (${source.slice(start, start + length)});`)(value)
		);
		expect(
			renderIntlActivation(
				prepareIntlActivation(runtimeDescriptor(result.descriptors[0]!), values),
				createIntlEnvironment({ locale: 'en-US' })
			).join('')
		).toBe('authored');
	}
);

it('evaluates a locale helper once when the formatter remains an authored scalar', () => {
	const source = `function locale(){return 'en-US'} export function Page(value:number){return()=> <p intl:message>{new Intl.NumberFormat(locale(),{minimumFractionDigits:2}).format(value)}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	let reads = 0;
	const locale = () => {
		reads++;
		return 'en-US';
	};
	const values = native.regions[0]!.values.map(({ start, length }) =>
		new Function('locale', 'value', `return (${source.slice(start, start + length)});`)(locale, 12)
	);
	const output = renderIntlActivation(
		prepareIntlActivation(runtimeDescriptor(result.descriptors[0]!), values),
		createIntlEnvironment({ locale: 'en-US' })
	);
	expect(output.join('')).toBe(
		new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(12)
	);
	expect(reads).toBe(1);
});

it.each([false, true])('retains the current plural map values (mutated: %s)', (mutated) => {
	const source = `export function Page(value:number){const rules=new Intl.PluralRules('en-US');const forms={one:'one',other:'other'};${mutated ? "forms.one='changed';" : ''}return()=> <p intl:message>{forms[rules.select(value)]}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const rules = new Intl.PluralRules('en-US');
	const forms = { one: mutated ? 'changed' : 'one', other: 'other' };
	for (const value of [1, 2, 1]) {
		const values = native.regions[0]!.values.map(({ start, length }) =>
			new Function('value', 'forms', 'rules', `return (${source.slice(start, start + length)});`)(
				value,
				forms,
				rules
			)
		);
		const output = renderIntlActivation(
			prepareIntlActivation(runtimeDescriptor(result.descriptors[0]!), values),
			createIntlEnvironment({ locale: 'en-US' })
		);
		expect(output.join('')).toBe(forms[rules.select(value) as keyof typeof forms]);
	}
});

// Build metadata is deliberately removed at the runtime protocol boundary, as instrumentation does.
function runtimeDescriptor(descriptor: AnalyzedMessageDescriptorV1) {
	const {
		ownerComponentId: _owner,
		canonicalTranslation: _translation,
		sourceRange: _range,
		...runtime
	} = descriptor;
	return runtime;
}

it.each(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'])(
	'preserves optional Date.%s receivers in analyzed messages',
	(method) => {
		const source = `export function Page(value:Date|null){return()=> <p intl:message>{value?.${method}('en-US')}</p>;}`;
		const native = analyzer.analyze(source, options);
		const result = analyzer.analyzeSource(source, options);
		expect(result.diagnostics).toEqual([]);
		const readers = native.regions[0]!.values.map(
			({ start, length }) =>
				new Function('value', `return (${source.slice(start, start + length)});`)
		);
		const expected = new Function('value', `return value?.${method}('en-US');`);
		for (const value of [null, new Date(0), null, new Date(86400000)]) {
			const activation = prepareIntlActivation(
				runtimeDescriptor(result.descriptors[0]!),
				readers.map((read) => read(value))
			);
			expect(
				renderIntlActivation(activation, createIntlEnvironment({ locale: 'en-US' })).join('')
			).toBe(expected(value) ?? '');
		}
	}
);

it.each([
	['cardinal', "{type:'cardinal'}", 'select(value)'],
	['ordinal', "{type:'ordinal'}", 'select(value)'],
	['cardinal range', "{type:'cardinal'}", 'selectRange(value,end)'],
	['ordinal range', "{type:'ordinal'}", 'selectRange(value,end)'],
	['rounding fallback', '{minimumFractionDigits:2}', 'select(value)']
] as const)('preserves native %s lookup results', (_name, settings, method) => {
	const source = `export function Page(value:number,end:number){const rules=new Intl.PluralRules('en-US',${settings});const forms={zero:'zero',one:'one',two:'two',few:'few',many:'many',other:'other'};return()=> <p intl:message>{forms[rules.${method}]}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const rules = new Intl.PluralRules('en-US', new Function(`return (${settings});`)());
	const forms = { zero: 'zero', one: 'one', two: 'two', few: 'few', many: 'many', other: 'other' };
	const environment = createIntlEnvironment({ locale: 'en-US' });
	const expected = new Function('rules', 'forms', 'value', 'end', `return forms[rules.${method}];`);
	const readers = native.regions[0]!.values.map(
		({ start, length }) =>
			new Function(
				'rules',
				'forms',
				'value',
				'end',
				`return (${source.slice(start, start + length)});`
			)
	);
	for (const [value, end] of [
		[1, 1],
		[1, 2],
		[2, 3],
		[21, 22],
		[1.2, 1.7]
	]) {
		const values = readers.map((read) => read(rules, forms, value, end));
		expect(
			renderIntlActivation(
				prepareIntlActivation(runtimeDescriptor(result.descriptors[0]!), values),
				environment
			).join('')
		).toBe(expected(rules, forms, value, end));
	}
});

it.each([
	['number', "new Intl.NumberFormat('en-US',{useGrouping:false}).formatRange(value,end)"],
	[
		'currency',
		"new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',currencyDisplay:'code'}).formatRange(value,end)"
	],
	[
		'date',
		"new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',timeZone:'UTC'}).formatRange(value,end)"
	]
] as const)('retains both native %s range endpoints', (kind, expression) => {
	const type = kind === 'date' ? 'Date' : 'number';
	const source = `export function Page(value:${type},end:${type}){return()=> <p intl:message>{${expression}}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const expected = new Function('value', 'end', `return (${expression});`);
	const readers = native.regions[0]!.values.map(
		({ start, length }) =>
			new Function('value', 'end', `return (${source.slice(start, start + length)});`)
	);
	for (const [start, finish] of [
		[1, 1],
		[1, 2],
		[3, 7]
	]) {
		const value = kind === 'date' ? new Date(Date.UTC(2024, 0, start)) : start;
		const end = kind === 'date' ? new Date(Date.UTC(2024, 0, finish)) : finish;
		expect(
			renderIntlActivation(
				prepareIntlActivation(
					runtimeDescriptor(result.descriptors[0]!),
					readers.map((read) => read(value, end))
				),
				createIntlEnvironment({ locale: 'en-US' })
			).join('')
		).toBe(expected(value, end));
	}
});

it.each([
	{ role: 'intl:message', content: '{read()} / {read()}', expected: '80 / 50' },
	{
		role: 'intl:message',
		content:
			'<span intl:currency="USD">{read()}</span> / <span intl:currency="USD">{read()}</span>',
		expected: '$80.00 / $50.00'
	},
	{
		role: 'intl:unit="temperature-weather" intl:convert-to="celsius" difference',
		content: '{read() - read()} °F',
		expected: '16.667°C'
	}
])('preserves every authored call occurrence in $role', ({ role, content, expected }) => {
	const source = `declare function read():number;export function Page(){return()=> <p ${role}>${content}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	let calls = 0;
	const read = () => [80, 50][calls++]!;
	const values = native.regions[0]!.values.map(({ start, length }) =>
		new Function('read', `return (${source.slice(start, start + length)});`)(read)
	);
	const activation = prepareIntlActivation(
		runtimeDescriptor(result.descriptors[0]!),
		values,
		native.regions[0]!.structures.map(() => (content: readonly Child[]) => [...content])
	);
	expect(
		renderIntlActivation(activation, createIntlEnvironment({ locale: 'en-US' })).join('')
	).toBe(expected);
	expect(calls).toBe(2);
});

it('preserves repeated property reads that can invoke getters', () => {
	const source = `export function Page(value:{reading:number}){return()=> <p intl:message>{value.reading} / {value.reading}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	let reads = 0;
	const value = {
		get reading() {
			return [80, 50][reads++]!;
		}
	};
	const values = native.regions[0]!.values.map(({ start, length }) =>
		new Function('value', `return (${source.slice(start, start + length)});`)(value)
	);
	expect(
		renderIntlActivation(
			prepareIntlActivation(runtimeDescriptor(result.descriptors[0]!), values),
			createIntlEnvironment({ locale: 'en-US' })
		).join('')
	).toBe('80 / 50');
	expect(reads).toBe(2);
});

it('reads an identifier again after an intervening call changes it', () => {
	const source = `let current=80;function advance(){current=50;return '/'} export function Page(){return()=> <p intl:message>{current} {advance()} {current}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const expressions = native.regions[0]!.values.map(({ start, length }) =>
		source.slice(start, start + length)
	);
	const values = new Function(
		`let current=80;function advance(){current=50;return '/'} return [${expressions.join(',')}];`
	)();
	expect(
		renderIntlActivation(
			prepareIntlActivation(runtimeDescriptor(result.descriptors[0]!), values),
			createIntlEnvironment({ locale: 'en-US' })
		).join('')
	).toBe('80 / 50');
});

it.each([
	{ role: 'select', type: 'string', reading: 'owner', condition: "'owner'" },
	{ role: 'plural', type: 'number', reading: 1, condition: '1' }
])(
	'retains one matching explicit $role decision with a getter',
	({ role, type, reading, condition }) => {
		const source = `export function Page(value:{reading:${type}}){return()=> <p intl:message><_ intl:${role}={value.reading}>{value.reading===${condition}?'Matched':'Other'}</_></p>;}`;
		const native = analyzer.analyze(source, options);
		const result = analyzer.analyzeSource(source, options);
		expect(result.diagnostics).toEqual([]);
		let reads = 0;
		const value = {
			get reading() {
				reads++;
				return reading;
			}
		};
		const values = native.regions[0]!.values.map(({ start, length }) =>
			new Function('value', `return (${source.slice(start, start + length)});`)(value)
		);
		expect(
			renderIntlActivation(
				prepareIntlActivation(runtimeDescriptor(result.descriptors[0]!), values),
				createIntlEnvironment({ locale: 'en-US' })
			).join('')
		).toBe('Matched');
		expect(reads).toBe(1);
	}
);
