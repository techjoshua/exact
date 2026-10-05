import { afterAll, expect, it } from 'vitest';
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
