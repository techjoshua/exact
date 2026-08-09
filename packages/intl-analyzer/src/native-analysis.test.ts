import { afterAll, describe, expect, it } from 'vitest';
import { NativeIntlAnalyzer } from './native-analysis.js';

const analyzer = new NativeIntlAnalyzer();

afterAll(() => analyzer.dispose());

describe('native intl analyzer', () => {
	it('projects native byte spans into JavaScript UTF-16 offsets', () => {
		const source = `export function Values(total: number, date: Date) { return () => <><_ intl:cldr="temperature/weather">{total} °C</_><p intl:message>Published {new Intl.DateTimeFormat('en-US').format(date)}.</p></>; }`;
		const result = analyzer.analyzeSource(source, {
			filename: 'C:/app/src/Unicode.tsx',
			owner: '@app/example',
			sourceLocale: 'en-US'
		});

		expect(result.diagnostics).toEqual([]);
		expect(result.code).toContain(`>{total} °C</_>`);
		expect(result.code).toContain(`Published {new Intl.DateTimeFormat('en-US').format(date)}.`);
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
			context: 'welcome'
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
			`export function Search({ count }) { return () => <><input placeholder="Search messages" intl:placeholder /><button aria-label={count === 1 ? \`Delete \${count} message\` : \`Delete \${count} messages\`} intl:aria-label={{ context: 'delete-control' }} /></>; }`,
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
			`export function Values(total: number, minimumDistance: number, maximumDistance: number) { return () => <><_ intl:currency>{total} US dollars</_><_ intl:unit="distance-road" intl:convert-to="kilometer">{minimumDistance}-{maximumDistance} miles</_></>; }`,
			'C:/app/src/Values.tsx'
		);
	});

	it('matches exact CLDR selectors and offset-unit projections', () => {
		expectNativeDescriptors(
			`export function Weather(temperature: number) { return () => <_ intl:cldr="temperature/weather" intl:convert-to="fahrenheit">{temperature} °C</_>; }`,
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

	it('matches the equivalent local array/find relative-duration helper', () => {
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

	it('analyzes explicit intl-role components through the same prepared message IR', () => {
		const source = `import { IntlMessage, IntlUnit } from '@exactjs/intl';
		export function View(name: string, distance: number) { return () => <><IntlMessage context="navigation">Hello {name}</IntlMessage><IntlUnit unit="distance-road">{distance} miles</IntlUnit></>; }`;
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
