import { afterAll, describe, expect, it } from 'vitest';
import { NativeIntlAnalyzer } from './native-analysis.js';

const analyzer = new NativeIntlAnalyzer();

afterAll(() => analyzer.dispose());

describe('native intl analyzer', () => {
	it.each(['intl:message', 'intl:currency', 'intl:unit="distance-road"'])(
		'preserves proven scalar results and rejects opaque results for %s',
		(enhancement) => {
			for (const [declaration, valid] of [
				['function helper(value:number){return Math.round(value);}', true],
				['function helper(value:number){return {value};}', false],
				['declare function helper(value:number):unknown;', false],
				['declare function helper(value:number):any;', false],
				['async function helper(value:number){return value;}', false]
			] as const) {
				const source = `${declaration}export function View(value:number){return()=> <p ${enhancement}>{helper(value)}</p>;}`;
				const result = analyzer.analyzeSource(source, {
					filename: '/src/ScalarCalls.tsx',
					owner: 'example',
					sourceLocale: 'en-US'
				});
				if (valid) {
					expect(result.diagnostics).toEqual([]);
					expect(result.code).toContain('[helper(value)]');
				} else {
					expect(result.descriptors).toEqual([]);
					expect(result.diagnostics.length).toBeGreaterThan(0);
					expect(result.code).toBe(source);
				}
			}
		}
	);
	it.each([
		{ options: "{['value']:count}", valid: true },
		{ options: '{value:other,value:count}', valid: true },
		{ options: '{...options,value:count}', valid: true },
		{ options: '{value:count,...options}', valid: false },
		{ options: '{value:count,[key]:other}', valid: false },
		{ options: '{[key]:other,value:count}', valid: true }
	])('preserves final selector ownership: $options', ({ options, valid }) => {
		const source = `export function View(count:number,other:number,options:object,key:string){return()=> <p intl:message><span intl:plural={${options}}>{count===1?'one':'many'}</span></p>;}`;
		const result = analyzer.analyzeSource(source, {
			filename: '/src/SelectorOptions.tsx',
			owner: 'example',
			sourceLocale: 'en-US'
		});
		if (valid) {
			expect(result.diagnostics).toEqual([]);
			expect(result.descriptors).toHaveLength(1);
			expect(result.code).toContain('[count]');
			expect(result.code).not.toContain('[other');
		} else {
			expect(result.descriptors).toEqual([]);
			expect(result.diagnostics.length).toBeGreaterThan(0);
			expect(result.code).toBe(source);
		}
	});

	it.each(["{name:'old',name:'final'}", "{['name']:'final'}", "{...options,name:'final'}"])(
		'uses final literal message names: %s',
		(options) => {
			const source = `export function View(label:string,options:object){return()=> <button aria-label={label} intl:aria-label={${options}}/>;}`;
			const result = analyzer.analyzeSource(source, {
				filename: '/src/NamedOptions.tsx',
				owner: 'example',
				sourceLocale: 'en-US'
			});
			expect(result.diagnostics).toEqual([]);
			expect(result.descriptors).toHaveLength(1);
			expect(result.descriptors[0]?.name).toBe('final');
		}
	);
	it('keeps extension edit spans in authored coordinates for destructured direct components', () => {
		const source = 'const View = ({ name }: {name: string}) => <p intl:message>Hello {name}</p>;';
		const result = analyzer.analyzeSource(source, {
			filename: 'C:/app/src/Props.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		});
		expect(result.diagnostics).toEqual([]);
		expect(result.code).toContain('<p __exactIntl:message={__exactPrepareIntl(');
		expect(result.code).toContain('[name]');
		expect(result.code).toContain('Hello {name}</p>;');
	});
	it('projects native byte spans into JavaScript UTF-16 offsets', () => {
		const source = `export function Values(total: number, date: Date) { return () => <><output intl:cldr="temperature/weather">{total} °C</output><p intl:message>Published {new Intl.DateTimeFormat('en-US').format(date)}.</p></>; }`;
		const result = analyzer.analyzeSource(source, {
			filename: 'C:/app/src/Unicode.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		});

		expect(result.diagnostics).toEqual([]);
		expect(result.code).toContain(`>{total} °C</output>`);
		expect(result.code).toContain(`Published {new Intl.DateTimeFormat('en-US').format(date)}.`);
	});

	it('identifies untranslated text and supported intrinsic properties with inherited opt-outs', () => {
		const source = `export function Page(description: string) { return () => <section title="Dashboard" aria-description={description}><p lang="en-US" dir="ltr">Translate me</p><div translate="no"><span title="Product name">Brand name</span><em translate="yes" title="Override">Translate again</em></div><img alt="Portrait" intl:alt /></section>; }`;
		const native = analyzer.analyze(source, {
			filename: 'C:/app/src/Page.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		});

		expect(
			native.untranslated.map((span) => source.slice(span.start, span.start + span.length))
		).toEqual(['description', 'Dashboard', 'Translate me', 'Override', 'Translate again']);
	});

	it('returns scalar and intrinsic structure message facts from native analysis', () => {
		const source = `export function Greeting(props: { name: string }) {
			return () => <p intl:message="welcome">Hello, {props.name}. <strong>Welcome!</strong></p>;
		}`;
		const options = {
			filename: 'C:/app/src/Greeting.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		};
		const native = analyzer.analyze(source, options);

		expect(native.diagnostics).toEqual([]);
		expect(native.descriptorOwnerOrdinals).toEqual([0]);
		expect(native.descriptors).toHaveLength(1);
		expect(native.descriptors[0]).toMatchObject({
			protocol: 1,
			owner: '@app/example',
			sourceLocale: 'en-US',
			target: { kind: 'content' },
			bindings: [
				{ index: 0, kind: 'value', type: 'string' },
				{ index: 1, kind: 'element', type: 'structure', name: 'strong', exactlyOnce: true }
			],
			name: 'welcome'
		});
		expect(native.descriptors[0]?.source).toEqual([
			{ kind: 'text', value: 'Hello, ' },
			{ kind: 'value', binding: 0 },
			{ kind: 'text', value: '. ' },
			{ kind: 'element', binding: 1, value: [{ kind: 'text', value: 'Welcome!' }] }
		]);
		expect(native.regions[0]?.values).toHaveLength(1);
		expect(native.regions[0]?.structures).toHaveLength(1);
	});

	it('derives property message names from the nearest named content message', () => {
		const source = `export function Account() { return () => <section intl:message="account" title="Summary" intl:title>Hello</section>; }`;
		const native = analyzer.analyzeSource(source, {
			filename: 'C:/app/src/Account.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		});

		expect(native.descriptors.map((descriptor) => descriptor.name)).toEqual([
			'account',
			'account_title'
		]);
		expect(native.descriptors.map((descriptor) => descriptor.key)).toEqual([
			expect.stringMatching(/^account_/u),
			expect.stringMatching(/^account_title_/u)
		]);
	});

	it('matches finite boolean, exact, and cardinal branch projections', () => {
		expectNativeDescriptors(
			`const View = ({ count, ready, role }) => <p intl:message>You have {count} new {count === 1 ? 'message' : 'messages'}. {ready ? 'Ready' : 'Waiting'}: {role === 'owner' ? 'Owner' : 'Member'}</p>;`,
			'C:/app/src/Branches.tsx'
		);
	});

	it('matches standard Intl currency, date-time, display-name, unit, and list projections', () => {
		expectNativeDescriptors(
			`const View = () => <p intl:message>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)} on {new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date)}; {Intl.DisplayNames('en-US', { type: 'language' }).of(language)}; {Intl.NumberFormat('en-US', { style: 'unit', unit: 'kilometer', unitDisplay: 'long' }).format(distance)}; {Intl.ListFormat('en-US', { type: 'conjunction' }).format(names)}</p>;`,
			'C:/app/src/NativeIntl.tsx'
		);
	});

	it('matches independent intrinsic property message facts', () => {
		expectNativeDescriptors(
			`export function Search({ count }) { return () => <><input placeholder="Search messages" intl:placeholder /><button aria-label={count === 1 ? \`Delete \${count} message\` : \`Delete \${count} messages\`} intl:aria-label={{ name: 'delete-control' }} /></>; }`,
			'C:/app/src/Search.tsx'
		);
	});

	it('matches explicitly named intrinsic and opaque structural slots', () => {
		expectNativeDescriptors(
			`export function Notice() { return () => <p intl:message>Read <a href="/terms" intl:fragment="terms">terms</a>. Welcome <_ intl:fragment="user"><UserBadge /></_>.</p>; }`,
			'C:/app/src/Notice.tsx'
		);
	});

	it('matches display-name property roles', () => {
		expectNativeDescriptors(
			`export function Language(languageCode: string) { return () => <button aria-label={languageCode} intl:aria-label="display-name:languageCode" />; }`,
			'C:/app/src/Language.tsx'
		);
	});

	it('matches inferred currency and semantic road-distance ranges', () => {
		expectNativeDescriptors(
			`export function Values(total: number, minimumDistance: number, maximumDistance: number) { return () => <><output intl:currency>{total} US dollars</output><output intl:unit="distance-road" intl:convert-to="kilometer">{minimumDistance}-{maximumDistance} miles</output></>; }`,
			'C:/app/src/Values.tsx'
		);
	});

	it('matches exact CLDR selectors and offset-unit projections', () => {
		expectNativeDescriptors(
			`export function Weather(temperature: number) { return () => <output intl:cldr="temperature/weather" intl:convert-to="fahrenheit">{temperature} °C</output>; }`,
			'C:/app/src/Weather.tsx'
		);
	});

	it('matches date ranges, Temporal locale formatting, and direct durations', () => {
		expectNativeDescriptors(
			`export function Timing(start: Temporal.PlainDate, end: Temporal.PlainDate, publishedAt: Temporal.ZonedDateTime, duration: Temporal.Duration) { return () => <p intl:message>{Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).formatRange(start, end)}; {publishedAt.toLocaleString('en-US', { dateStyle: 'long' })}; took {duration}</p>; }`,
			'C:/app/src/Timing.tsx'
		);
	});

	it('matches ordinal suffix and native relative-time projections', () => {
		expectNativeDescriptors(
			`export function Placement(position: number) { return () => <><p intl:message>You placed {position}{position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}.</p><p intl:message>Posted {new Intl.RelativeTimeFormat('en-US', { numeric: 'always' }).format(-5, 'minutes')}.</p></>; }`,
			'C:/app/src/Placement.tsx'
		);
	});

	it('matches finite Temporal relative-duration fallbacks and requirements', () => {
		const source = `export function Posted(duration: Temporal.Duration) { return () => <p intl:message>Posted {
			Math.abs(duration.years) > 0 ? \`${'${Math.abs(duration.years)}'} year${"${Math.abs(duration.years) === 1 ? '' : 's'}"} ago\` :
			Math.abs(duration.months) > 0 ? \`${'${Math.abs(duration.months)}'} month${"${Math.abs(duration.months) === 1 ? '' : 's'}"} ago\` :
			Math.abs(duration.days) > 0 ? \`${'${Math.abs(duration.days)}'} day${"${Math.abs(duration.days) === 1 ? '' : 's'}"} ago\` :
			'just now'
		}</p>; }`;
		const options = {
			filename: 'C:/app/src/Posted.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		};
		const native = analyzer.analyzeSource(source, options);
		expect(native.diagnostics).toEqual([]);
		expect(native.descriptors[0]).toMatchObject({
			bindings: [{ index: 0, kind: 'value', type: 'temporal-duration' }],
			capabilities: ['relative-duration']
		});
		expect(native.descriptors[0]?.source).toContainEqual(
			expect.objectContaining({
				kind: 'format',
				formatter: expect.objectContaining({ kind: 'relative-duration' })
			})
		);
		expect(native.clientRequirements).toEqual(['temporal']);
	});

	it('retains the local array/find relative-duration helper', () => {
		expectNativeDescriptors(
			`function relativeAge(duration: Temporal.Duration) {
				const units = [
					{ value: duration.years, unit: 'year' },
					{ value: duration.months, unit: 'month' },
					{ value: duration.days, unit: 'day' },
					{ value: duration.hours, unit: 'hour' },
					{ value: duration.minutes, unit: 'minute' },
					{ value: duration.seconds, unit: 'second' }
				] as const;
				const match = units.find(candidate => Math.abs(candidate.value) > 0);
				if (!match) return 'just now';
				return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(-Math.abs(match.value), match.unit);
			}
			export function Posted(duration: Temporal.Duration) { return () => <p intl:message>Posted {relativeAge(duration)}</p>; }`,
			'C:/app/src/PostedHelper.tsx'
		);
	});

	it.each([
		{
			name: 'changed predicate',
			predicate: 'candidate.value > 5',
			formatted: '-Math.abs(match.value)'
		},
		{
			name: 'future direction',
			predicate: 'Math.abs(candidate.value) > 0',
			formatted: 'Math.abs(match.value)'
		},
		{ name: 'custom value', predicate: 'Math.abs(candidate.value) > 0', formatted: '42' }
	])('preserves ordinary relative-duration helpers with $name', ({ predicate, formatted }) => {
		const source = `function relativeAge(duration: Temporal.Duration) {
			const units = [{value:duration.days,unit:'day'},{value:duration.hours,unit:'hour'}] as const;
			const match = units.find(candidate => ${predicate});
			if (!match) return 'just now';
			return new Intl.RelativeTimeFormat('en', {numeric:'always'}).format(${formatted}, match.unit);
		}
		export function Posted(duration: Temporal.Duration) { return () => <p intl:message>Posted {relativeAge(duration)}</p>; }`;
		const result = analyzer.analyzeSource(source, {
			filename: '/src/PostedHelper.tsx',
			owner: 'example',
			sourceLocale: 'en-US'
		});
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.capabilities).not.toContain('relative-duration');
		expect(result.code).toContain('[relativeAge(duration)]');
	});

	it.each(['wrong unit', 'changed text', 'scaled value'])(
		'preserves or diagnoses non-equivalent inline duration branches: %s',
		(change) => {
			const value =
				change === 'scaled value' ? 'Math.abs(duration.days) * 2' : 'Math.abs(duration.days)';
			const label = change === 'wrong unit' ? 'hour' : 'day';
			const suffix = change === 'changed text' ? ' remaining' : ' ago';
			const source = `export function Posted(duration: Temporal.Duration) {return () => <p intl:message>{
			Math.abs(duration.days)>0 ? \`\${${value}} ${label}\${Math.abs(duration.days)===1?'':'s'}${suffix}\` :
			Math.abs(duration.hours)>0 ? \`\${Math.abs(duration.hours)} hour\${Math.abs(duration.hours)===1?'':'s'} ago\` : 'just now'
		}</p>;}`;
			const result = analyzer.analyzeSource(source, {
				filename: '/src/Posted.tsx',
				owner: 'example',
				sourceLocale: 'en-US'
			});
			if (change === 'scaled value') {
				expect(result.descriptors).toEqual([]);
				expect(result.diagnostics[0]?.message).toContain('cannot extract');
				expect(result.code).toBe(source);
			} else {
				expect(result.diagnostics).toEqual([]);
				expect(result.descriptors[0]?.capabilities).not.toContain('relative-duration');
				expect(JSON.stringify(result.descriptors[0]?.source)).toContain(
					change === 'wrong unit' ? ' hour' : ' remaining'
				);
			}
		}
	);

	it.each(['NumberFormat', 'RelativeTimeFormat', 'PluralRules'])(
		'preserves shadowed Intl.%s calls',
		(constructor) => {
			const expression =
				constructor === 'PluralRules'
					? `({one:'one',other:'many'})[new Intl.PluralRules('fr-FR').select(value)]`
					: `new Intl.${constructor}('fr-FR').format(value${constructor === 'RelativeTimeFormat' ? ", 'day'" : ''})`;
			const source = `export function View(Intl: {NumberFormat:new(...args:unknown[])=>{format(...args:unknown[]):string};RelativeTimeFormat:new(...args:unknown[])=>{format(...args:unknown[]):string};PluralRules:new(...args:unknown[])=>{select(n:number):string}}, value: number) {return()=> <p intl:message>{${expression}}</p>;}`;
			const result = analyzer.analyzeSource(source, {
				filename: '/src/Shadowed.tsx',
				owner: 'example',
				sourceLocale: 'en-US'
			});
			expect(result.diagnostics).toEqual([]);
			expect(result.descriptors[0]?.source).toEqual([{ kind: 'value', binding: 0 }]);
			expect(result.code).toContain(expression);
		}
	);

	it('preserves custom locale-named methods without native locale diagnostics', () => {
		const source = `export function View(value:{toLocaleString(locale:string):string}){return()=> <p intl:message>{value.toLocaleString('fr-FR')}</p>;}`;
		const result = analyzer.analyzeSource(source, {
			filename: '/src/Custom.tsx',
			owner: 'example',
			sourceLocale: 'en-US'
		});
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toEqual([{ kind: 'value', binding: 0 }]);
		expect(result.code).toContain("value.toLocaleString('fr-FR')");
	});

	it.each([
		`new Intl.PluralRules('en-US').select(value)`,
		`new Intl.PluralRules('en-US').selectRange(value,value)`,
		`({select: (n:number) => String(n)}).select(value)`,
		`({selectRange: (n:number) => String(n)}).selectRange(value,value)`
	])('keeps locale scanning alive for direct selection: %s', (expression) => {
		const result = analyzer.analyzeSource(
			`export function View(value:number){return()=> <p intl:message>{${expression}}</p>;}`,
			{
				filename: '/src/Select.tsx',
				owner: 'example',
				sourceLocale: 'en-US'
			}
		);
		if (expression.includes('Intl.PluralRules') && expression.includes('selectRange')) {
			expect(result.diagnostics[0]?.message).toContain('cannot extract');
		} else {
			expect(result.diagnostics).toEqual([]);
			expect(result.descriptors).toHaveLength(1);
		}
		const control = analyzer.analyzeSource(
			`export function View(){return()=> <p intl:message>Ready</p>;}`,
			{
				filename: '/src/Control.tsx',
				owner: 'example',
				sourceLocale: 'en-US'
			}
		);
		expect(control.diagnostics).toEqual([]);
		expect(control.descriptors).toHaveLength(1);
	});

	it('instruments values, structures, content factories, and component companions from spans', () => {
		const source = `export function Greeting(name: string) { return () => <p intl:message="welcome">Hello {name}, <strong>welcome</strong>.</p>; }`;
		const result = analyzer.analyzeSource(source, {
			filename: 'C:/app/src/Greeting.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US',
			descriptorModuleId: 'virtual:exact-intl/C:/app/src/Greeting.tsx',
			generation: 4
		});
		expect(result.code).toContain('from "@exactjs/intl/enhancements"');
		expect(result.code).toContain('__exactIntl:message={__exactPrepareIntl(');
		expect(result.code).toContain('[name]');
		expect(result.code).toContain('__intlChildren => <strong>{__intlChildren}</strong>');
		expect(result.code).toContain('__intlContent => <p>{__intlContent}</p>');
		expect(result.companions).toHaveLength(1);
		expect(result.companions?.[0]).toMatchObject({ generation: 4, descriptorIndexes: [0] });
	});

	it('moves peer target capabilities onto a reconstructed message target', () => {
		const source = `import * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement' };
		export function Notice() { return () => <p theme:surface="sunken" intl:message>Translated</p>; }`;
		const result = analyzer.analyzeSource(source, {
			filename: 'C:/app/src/Notice.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		});

		expect(result.code.match(/theme:surface="sunken"/gu)).toHaveLength(1);
		expect(result.code).toContain('__intlContent => <p theme:surface="sunken">{__intlContent}</p>');
	});

	it('keeps peer target capabilities on targets translated only through properties', () => {
		const source = `import * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement' };
		export function Search() { return () => <input theme:field placeholder="Search messages" intl:placeholder />; }`;
		const result = analyzer.analyzeSource(source, {
			filename: 'C:/app/src/Search.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		});

		expect(result.code.match(/theme:field/gu)).toHaveLength(1);
		expect(result.code).toContain('theme:field');
		expect(result.code).toContain('__exactIntl:placeholder=');
	});

	it('analyzes explicit intl-role components through the same prepared message IR', () => {
		const source = `import { IntlMessage, IntlUnit } from '@exactjs/intl';
		export function View(name: string, distance: number) { return () => <><IntlMessage name="navigation">Hello {name}</IntlMessage><IntlUnit unit="distance-road">{distance} miles</IntlUnit></>; }`;
		const result = analyzer.analyzeSource(source, {
			filename: 'C:/app/src/Explicit.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		});
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors).toHaveLength(2);
		expect(result.code).toContain('<IntlMessage message={__exactPrepareIntl(');
		expect(result.code).toContain('<IntlUnit unit={__exactPrepareIntl(');
		expect(result.code).not.toContain('@exactjs/intl/enhancements');
		expect(result.descriptors.map((descriptor) => descriptor.capabilities)).toEqual([[], ['unit']]);
	});
});

function expectNativeDescriptors(source: string, filename: string): void {
	const options = { filename, owner: '@app/example', sourceLocale: 'en-US' };
	const native = analyzer.analyzeSource(source, options);
	expect(native.diagnostics).toEqual([]);
	expect(native.descriptors.length).toBeGreaterThan(0);
	expect(native.descriptorOwnerOrdinals).toHaveLength(native.descriptors.length);
	for (const descriptor of native.descriptors)
		expect(descriptor).toMatchObject({ protocol: 1, owner: '@app/example', sourceLocale: 'en-US' });
}
