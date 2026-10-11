import { afterAll, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { createIntlEnvironment } from '@exactjs/intl';
import { prepareIntlActivation, renderIntlActivation } from '@exactjs/intl/internal';
import { NativeIntlAnalyzer } from './native-analysis.js';

const analyzer = new NativeIntlAnalyzer();
afterAll(() => analyzer.dispose());
const options = { filename: '/src/Projections.tsx', owner: 'example', sourceLocale: 'en-US' };

it.each([
	['toLocaleString', { timeZone: 'UTC' }],
	['toLocaleString', { timeZoneName: 'short', timeZone: 'UTC' }],
	['toLocaleString', { era: 'short', timeZone: 'UTC' }],
	['toLocaleDateString', { hour: 'numeric', timeZone: 'UTC' }],
	['toLocaleTimeString', { year: 'numeric', timeZone: 'UTC' }],
	['toLocaleDateString', { dateStyle: 'short', timeZone: 'UTC' }],
	['toLocaleTimeString', { timeStyle: 'short', timeZone: 'UTC' }],
	['toLocaleString', { fractionalSecondDigits: 2, timeZone: 'UTC' }]
] as const)('preserves %s defaults with %j', (method, formatOptions) => {
	const expression = `value.${method}('en-US',${JSON.stringify(formatOptions)})`;
	const source = `export function Page(value:Date){return()=> <p intl:message>{${expression}}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const {
		ownerComponentId: _owner,
		canonicalTranslation: _translation,
		sourceRange: _range,
		...descriptor
	} = result.descriptors[0]!;
	for (const value of [new Date('2024-03-02T15:04:05Z'), new Date('2025-11-12T08:09:10Z')]) {
		const values = native.regions[0]!.values.map(({ start, length }) =>
			new Function('value', `return (${source.slice(start, start + length)});`)(value)
		);
		expect(
			renderIntlActivation(
				prepareIntlActivation(descriptor, values),
				createIntlEnvironment({ locale: 'en-US' })
			).join('')
		).toBe(new Function('value', `return ${expression};`)(value));
	}
});

it.each([
	['string', 'abc'],
	['Set<string>', new Set(['first', 'second'])],
	['readonly string[]', ['first', 'second']],
	['[string,string]', ['first', 'second']]
] as const)('preserves native ListFormat iterable behavior for %s', (type, value) => {
	const source = `export function Page(value:${type}){return()=> <p intl:message>{new Intl.ListFormat('en-US').format(value)}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const {
		ownerComponentId: _owner,
		canonicalTranslation: _translation,
		sourceRange: _range,
		...descriptor
	} = result.descriptors[0]!;
	const values = native.regions[0]!.values.map(({ start, length }) =>
		new Function('value', `return (${source.slice(start, start + length)});`)(value)
	);
	expect(
		renderIntlActivation(
			prepareIntlActivation(descriptor, values),
			createIntlEnvironment({ locale: 'en-US' })
		).join('')
	).toBe(new Intl.ListFormat('en-US').format(value));
});

it.each([
	['Date', "value.toLocaleString('en-US')", new Date(Number.NaN)],
	[
		'bigint',
		"new Intl.NumberFormat('en-US',{style:'unit',unit:'mile'}).format(value)",
		9007199254740993n
	],
	[
		'string[]',
		"new Intl.ListFormat('en-US').format(value)",
		Object.assign(['first', 'second'], {
			*[Symbol.iterator]() {
				yield 'changed';
			}
		})
	]
] as const)('retains native neighboring projection behavior for %s', (type, expression, value) => {
	const source = `export function Page(value:${type}){return()=> <p intl:message>{${expression}}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	const {
		ownerComponentId: _owner,
		canonicalTranslation: _translation,
		sourceRange: _range,
		...descriptor
	} = result.descriptors[0]!;
	const values = native.regions[0]!.values.map(({ start, length }) =>
		new Function('value', `return (${source.slice(start, start + length)});`)(value)
	);
	expect(
		renderIntlActivation(
			prepareIntlActivation(descriptor, values),
			createIntlEnvironment({ locale: 'en-US' })
		).join('')
	).toBe(new Function('value', `return ${expression};`)(value));
});

it.each([
	['number', "new Intl.NumberFormat('en-US-u-nu-arab').format(value)", 1234],
	[
		'Date',
		"new Intl.DateTimeFormat('en-US-u-ca-islamic',{timeZone:'UTC'}).format(value)",
		new Date('2024-03-02T15:04:05Z')
	],
	[
		'Date',
		"value.toLocaleDateString('en-US-u-ca-islamic',{timeZone:'UTC'})",
		new Date('2024-03-02T15:04:05Z')
	]
] as const)('preserves authored Unicode locale settings for %s', (type, expression, value) => {
	const source = `export function Page(value:${type}){return()=> <p intl:message>{${expression}}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const {
		ownerComponentId: _owner,
		canonicalTranslation: _translation,
		sourceRange: _range,
		...descriptor
	} = result.descriptors[0]!;
	const values = native.regions[0]!.values.map(({ start, length }) =>
		new Function('value', `return (${source.slice(start, start + length)});`)(value)
	);
	expect(
		renderIntlActivation(
			prepareIntlActivation(descriptor, values),
			createIntlEnvironment({ locale: 'en-US' })
		).join('')
	).toBe(new Function('value', `return ${expression};`)(value));
});

it.each([
	['mile', Number.NaN],
	['mile', Number.POSITIVE_INFINITY],
	['degree', 12],
	['percent', 50],
	['meter-per-second', 15],
	['mile', 9007199254740993n]
] as const)('preserves native unit %s for %s', (unit, value) => {
	const expression = `new Intl.NumberFormat('en-US',{style:'unit',unit:${JSON.stringify(unit)}}).format(value)`;
	const source = `export function Page(value:number|bigint){return()=> <p intl:message>{${expression}}</p>;}`;
	const native = analyzer.analyze(source, options);
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const {
		ownerComponentId: _owner,
		canonicalTranslation: _translation,
		sourceRange: _range,
		...descriptor
	} = result.descriptors[0]!;
	const values = native.regions[0]!.values.map(({ start, length }) =>
		new Function('value', `return (${source.slice(start, start + length)});`)(value)
	);
	expect(
		renderIntlActivation(
			prepareIntlActivation(descriptor, values),
			createIntlEnvironment({ locale: 'en-US' })
		).join('')
	).toBe(new Intl.NumberFormat('en-US', { style: 'unit', unit }).format(value));
});

it.each(['square-meter', 'hectopascal', 'kilowatt-hour', 'meter-per-second-per-hour'])(
	'retains native invalid-unit errors for %s',
	(unit) => {
		const expression = `new Intl.NumberFormat('en-US',{style:'unit',unit:${JSON.stringify(unit)}}).format(value)`;
		const source = `export function Page(value:number){return()=> <p intl:message>{${expression}}</p>;}`;
		const result = analyzer.analyzeSource(source, options);
		expect(result.descriptors[0]!.source[0]!.kind).toBe('value');
		expect(() => new Function('value', `return ${expression};`)(1)).toThrow(RangeError);
	}
);

it.each([
	['string[]', "new Intl.ListFormat('en-US').format(value)", [1], TypeError],
	['Date', "new Intl.DateTimeFormat('en-US').format(value)", new Date(Number.NaN), RangeError]
] as const)('preserves native invalid-value errors for %s', (type, expression, value, error) => {
	const source = `export function Page(value:${type}){return()=> <p intl:message>{${expression}}</p>;}`;
	const result = analyzer.analyzeSource(source, options);
	expect(result.diagnostics).toEqual([]);
	const {
		ownerComponentId: _owner,
		canonicalTranslation: _translation,
		sourceRange: _range,
		...descriptor
	} = result.descriptors[0]!;
	expect(() => new Function('value', `return ${expression};`)(value)).toThrow(error);
	expect(() =>
		renderIntlActivation(
			prepareIntlActivation(descriptor, [value]),
			createIntlEnvironment({ locale: 'en-US' })
		)
	).toThrow(error);
});

it('preserves Invalid Date from another realm', () => {
	const source =
		"export function Page(value:Date){return()=> <p intl:message>{value.toLocaleString('en-US')}</p>;}";
	const result = analyzer.analyzeSource(source, options);
	const {
		ownerComponentId: _owner,
		canonicalTranslation: _translation,
		sourceRange: _range,
		...descriptor
	} = result.descriptors[0]!;
	const value: unknown = runInNewContext('new Date(NaN)');
	expect(
		renderIntlActivation(
			prepareIntlActivation(descriptor, [value]),
			createIntlEnvironment({ locale: 'en-US' })
		).join('')
	).toBe('Invalid Date');
});

it('maps normalized label evidence to authored UTF-16 spans after non-ASCII text', () => {
	const source =
		"export function Page(value:number){return()=> <div>多<p intl:unit='length/road'>{value} ㎞</p></div>;}";
	const result = analyzer.analyze(source, options);
	expect(result.diagnostics).toEqual([]);
	expect(
		result.regions[0]?.evidence.map(({ start, length }) => source.slice(start, start + length))
	).toEqual(['㎞']);
});
