import { describe, expect, it } from 'vitest';
import { validateIntlRuntimeDescriptor } from '@exactjs/intl/internal';
import { analyzeIntlSource } from './index.js';

describe('analyzeIntlSource', () => {
	it('validates literal locale-scope activations without treating them as messages', () => {
		const valid = analyzeIntlSource(
			'export function View() { return () => <section intl:locale="ar-EG">Text</section>; }',
			{ filename: '/src/View.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		const invalid = analyzeIntlSource(
			'export function View() { return () => <section intl:locale="not a locale">Text</section>; }',
			{ filename: '/src/View.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(valid.diagnostics).toEqual([]);
		expect(valid.descriptors).toEqual([]);
		expect(invalid.diagnostics[0]?.message).toContain('valid BCP 47 locale');
	});

	it('instruments text and scalar messages with stable descriptors', () => {
		const result = analyzeIntlSource(
			'export function Greeting(props: { name: string }) { return () => <p intl:message>Hello {props.name}</p>; }',
			{ filename: '/src/Greeting.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptorOwnerOrdinals).toEqual([0]);
		expect(result.code).toContain('prepareIntlActivation as __exactPrepareIntl');
		expect(result.code).toContain('__exactIntl:message={__exactPrepareIntl');
		expect(result.code).toContain('const __exactIntlDescriptor0 =');
		expect(result.code).toContain('__exactPrepareIntl(__exactIntlDescriptor0, [props.name]');
		expect(result.descriptors[0]?.source).toEqual([
			{ kind: 'text', value: 'Hello ' },
			{ kind: 'value', binding: 0 }
		]);
		const {
			ownerComponentId: _owner,
			canonicalTranslation: _canonical,
			sourceRange: _range,
			...runtime
		} = result.descriptors[0]!;
		expect(() => validateIntlRuntimeDescriptor(runtime)).not.toThrow();
	});

	it('preserves collapsed spaces at multiline JSX child boundaries', () => {
		const result = analyzeIntlSource(
			`export function Notice(props: { date: string }) {
				return () => <p intl:message>
					Published
					{props.date}
					today.
				</p>;
			}`,
			{ filename: '/src/Notice.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toEqual([
			{ kind: 'text', value: 'Published ' },
			{ kind: 'value', binding: 0 },
			{ kind: 'text', value: ' today.' }
		]);
	});

	it('does not turn indentation before closing punctuation into visible space', () => {
		const result = analyzeIntlSource(
			`export function Notice(props: { date: string }) {
				return () => <p intl:message>
					Published {props.date}
					.
				</p>;
			}`,
			{ filename: '/src/Notice.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toEqual([
			{ kind: 'text', value: 'Published ' },
			{ kind: 'value', binding: 0 },
			{ kind: 'text', value: '.' }
		]);
	});

	it('assigns messages to source-ordered component fact ordinals', () => {
		const result = analyzeIntlSource(
			`export function Plain() { return () => <span />; }
			export function Greeting() { return () => <p intl:message>Hello</p>; }
			export const Farewell = () => () => <p intl:message>Goodbye</p>;`,
			{ filename: '/src/Messages.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.descriptorOwnerOrdinals).toEqual([1, 2]);
	});

	it('can move hoisted descriptors into a bundler-owned companion module', () => {
		const result = analyzeIntlSource(
			'const View = ({ name }) => <p intl:message>Hello {name}</p>;',
			{
				filename: '/src/View.tsx',
				owner: 'example',
				sourceLocale: 'en-US',
				descriptorModuleId: 'virtual:exact-intl/descriptor/view',
				generation: 7
			}
		);
		expect(result.code).toContain('from "virtual:exact-intl/descriptor/view/component/0"');
		expect(result.code).not.toContain('const __exactIntlDescriptor0 =');
		expect(result.companions?.[0]).toMatchObject({
			id: 'virtual:exact-intl/descriptor/view/component/0',
			generation: 7
		});
		expect(result.companions?.[0]?.code).toContain('export const generation = 7');
	});

	it('splits descriptor companions by owning component', () => {
		const result = analyzeIntlSource(
			`export function First() { return () => <p intl:message>First</p>; }
			export function Second() { return () => <p intl:message>Second</p>; }`,
			{
				filename: '/src/Views.tsx',
				owner: 'example',
				sourceLocale: 'en-US',
				descriptorModuleId: 'virtual:exact-intl/descriptor/views'
			}
		);

		expect(result.companions?.map((companion) => companion.descriptorIndexes)).toEqual([[0], [1]]);
		expect(result.code).toContain('/component/0');
		expect(result.code).toContain('/component/1');
	});

	it('infers native currency and date-time formatting intent', () => {
		const result = analyzeIntlSource(
			`const View = () => <p intl:message>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)} on {new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date)}</p>;`,
			{ filename: '/src/View.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toMatchObject([
			{ kind: 'format', formatter: { kind: 'currency', currency: 'USD', display: 'symbol' } },
			{ kind: 'text', value: ' on ' },
			{ kind: 'format', formatter: { kind: 'date-time' } }
		]);
	});

	it('infers native display-name, unit, and list formatting intent', () => {
		const result = analyzeIntlSource(
			`const View = () => <p intl:message>
				{Intl.DisplayNames('en-US', { type: 'language' }).of(language)};
				{Intl.NumberFormat('en-US', { style: 'unit', unit: 'kilometer', unitDisplay: 'long' }).format(distance)};
				{Intl.ListFormat('en-US', { type: 'conjunction' }).format(names)}
			</p>;`,
			{ filename: '/src/NativeIntl.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'format',
					formatter: expect.objectContaining({ kind: 'display-name', domain: 'language' })
				}),
				expect.objectContaining({
					kind: 'format',
					formatter: expect.objectContaining({
						kind: 'unit',
						quantity: 'length',
						sourceUnit: 'kilometer'
					})
				}),
				expect.objectContaining({
					kind: 'format',
					formatter: expect.objectContaining({ kind: 'list' })
				})
			])
		);
	});

	it('applies a display-name role to an intrinsic property value', () => {
		const result = analyzeIntlSource(
			`export function Language(languageCode: string) {
				return () => <button aria-label={languageCode} intl:aria-label="display-name:languageCode" />;
			}`,
			{ filename: '/src/Language.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.target).toEqual({ kind: 'property', name: 'aria-label' });
		expect(result.descriptors[0]?.source).toEqual([
			{
				kind: 'format',
				bindings: [0],
				formatter: { kind: 'display-name', domain: 'language', options: {} }
			}
		]);
	});

	it('infers a semantic road-distance range and strips unit metadata', () => {
		const result = analyzeIntlSource(
			`export function Distance(minimumDistance: number, maximumDistance: number) {
				return () => <_ intl:unit="distance-road" intl:convert-to="kilometer">{minimumDistance}-{maximumDistance} miles</_>;
			}`,
			{ filename: '/src/Distance.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.code).toContain('__exactIntl:unit={__exactPrepareIntl');
		expect(result.code).not.toContain('intl:convert-to');
		expect(result.descriptors[0]?.source).toEqual([
			{
				kind: 'format',
				bindings: [0, 1],
				formatter: {
					kind: 'unit',
					quantity: 'length',
					usage: 'road',
					sourceUnit: 'mile',
					convertTo: 'kilometer',
					options: { unitDisplay: 'long' }
				}
			}
		]);
	});

	it('uses the source locale Intl vocabulary for unit labels', () => {
		const result = analyzeIntlSource(
			`export function Distance(distance: number) {
				return () => <_ intl:unit="distance-road">{distance} kilomètres</_>;
			}`,
			{ filename: '/src/Distance.tsx', owner: 'example', sourceLocale: 'fr-FR' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toMatchObject([
			{
				formatter: {
					kind: 'unit',
					sourceUnit: 'kilometer',
					options: { unitDisplay: 'long' }
				}
			}
		]);
	});

	it('infers currency and display from source locale and authored fallback', () => {
		const implicit = analyzeIntlSource(
			`export function Total(total: number) { return () => <_ intl:currency>{total}</_>; }`,
			{ filename: '/src/Total.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		const named = analyzeIntlSource(
			`export function Total(total: number) { return () => <_ intl:currency>{total} US dollars</_>; }`,
			{ filename: '/src/NamedTotal.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(implicit.diagnostics).toEqual([]);
		expect(implicit.descriptors[0]?.source).toMatchObject([
			{ formatter: { kind: 'currency', currency: 'USD', display: 'symbol' } }
		]);
		expect(named.diagnostics).toEqual([]);
		expect(named.descriptors[0]?.source).toMatchObject([
			{ formatter: { kind: 'currency', currency: 'USD', display: 'name' } }
		]);
	});

	it('keeps translation identity stable across exact execution-contract changes', () => {
		const minimum = analyzeIntlSource(
			`const View = (total: number) => <p intl:message="account-total">Total: {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(total)}</p>;`,
			{ filename: '/src/Minimum.tsx', owner: 'example', sourceLocale: 'en-US' }
		).descriptors[0]!;
		const maximum = analyzeIntlSource(
			`const View = (total: number) => <p intl:message="account-total">Total: {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(total)}</p>;`,
			{ filename: '/src/Maximum.tsx', owner: 'example', sourceLocale: 'en-US' }
		).descriptors[0]!;

		expect(minimum.name).toBe('account-total');
		expect(minimum.key).toMatch(/^account-total_/u);
		expect(minimum.key).toBe(maximum.key);
		expect(minimum.contract).not.toBe(maximum.contract);
	});

	it('uses CLDR likely-region data for implicit source currencies', () => {
		const german = analyzeIntlSource(
			`export function Total(total: number) { return () => <_ intl:currency>{total}</_>; }`,
			{ filename: '/src/GermanTotal.tsx', owner: 'example', sourceLocale: 'de-DE' }
		);
		const indianEnglish = analyzeIntlSource(
			`export function Total(total: number) { return () => <_ intl:currency>{total}</_>; }`,
			{ filename: '/src/IndianTotal.tsx', owner: 'example', sourceLocale: 'en-IN' }
		);

		expect(german.descriptors[0]?.source).toMatchObject([{ formatter: { currency: 'EUR' } }]);
		expect(indianEnglish.descriptors[0]?.source).toMatchObject([
			{ formatter: { currency: 'INR' } }
		]);
	});

	it.each([
		['fr-FR', 'euros', 'EUR', 'name'],
		['hi-IN', 'भारतीय रुपए', 'INR', 'name'],
		['pl-PL', 'złotego polskiego', 'PLN', 'name'],
		['ar-EG', 'ج.م.', 'EGP', 'symbol']
	] as const)(
		'infers native currency labels for the %s source locale',
		(sourceLocale, label, currency, display) => {
			const result = analyzeIntlSource(
				`export function Total(total: number) { return () => <_ intl:currency>{total} ${label}</_>; }`,
				{ filename: `/src/${sourceLocale}-Total.tsx`, owner: 'example', sourceLocale }
			);

			expect(result.diagnostics).toEqual([]);
			expect(result.descriptors[0]?.source).toMatchObject([
				{ formatter: { kind: 'currency', currency, display } }
			]);
		}
	);

	it('rejects explicit currency metadata that contradicts a localized fallback label', () => {
		const result = analyzeIntlSource(
			`export function Total(total: number) {
				return () => <_ intl:currency="USD">{total} euros</_>;
			}`,
			{ filename: '/src/ContradictoryTotal.tsx', owner: 'example', sourceLocale: 'fr-FR' }
		);

		expect(result.descriptors).toEqual([]);
		expect(result.diagnostics[0]?.message).toContain('static or source-locale currency');
	});

	it('infers callable date ranges and Temporal locale formatting', () => {
		const result = analyzeIntlSource(
			`export function Dates(start: Temporal.PlainDate, end: Temporal.PlainDate, publishedAt: Temporal.ZonedDateTime) {
				return () => <p intl:message>
					{Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).formatRange(start, end)}; {publishedAt.toLocaleString('en-US', { dateStyle: 'long' })}
				</p>;
			}`,
			{ filename: '/src/Dates.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'format',
					bindings: [0, 1],
					formatter: expect.objectContaining({ kind: 'date-time', range: true })
				}),
				expect.objectContaining({
					kind: 'format',
					formatter: expect.objectContaining({
						kind: 'date-time',
						temporalKind: 'temporal-zoned-date-time'
					})
				})
			])
		);
	});

	it('lowers a cardinal fallback ternary onto one shared selector binding', () => {
		const result = analyzeIntlSource(
			`const View = ({ count }) => <p intl:message>You have {count} new {count === 1 ? 'message' : 'messages'}.</p>;`,
			{ filename: '/src/View.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		const descriptor = result.descriptors[0]!;
		expect(result.diagnostics).toEqual([]);
		expect(descriptor.bindings).toEqual([{ index: 0, kind: 'selector', type: 'number' }]);
		expect(descriptor.source).toEqual([
			{ kind: 'text', value: 'You have ' },
			{ kind: 'value', binding: 0 },
			{ kind: 'text', value: ' new ' },
			{
				kind: 'select',
				binding: 0,
				selection: 'plural-cardinal',
				cases: [{ key: '=1', value: [{ kind: 'text', value: 'message' }] }],
				fallback: [{ kind: 'text', value: 'messages' }]
			},
			{ kind: 'text', value: '.' }
		]);
		expect(result.code.match(/\[count\]/g)).toHaveLength(1);
	});

	it('lowers finite boolean and exact selection without evaluating branch code', () => {
		const result = analyzeIntlSource(
			`const View = ({ ready, role }) => <p intl:message>{ready ? 'Ready' : 'Waiting'}: {role === 'owner' ? 'Owner' : 'Member'}</p>;`,
			{ filename: '/src/View.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toMatchObject([
			{ kind: 'select', selection: 'boolean', cases: [{ key: 'true' }] },
			{ kind: 'text', value: ': ' },
			{ kind: 'select', selection: 'exact', cases: [{ key: 'owner' }] }
		]);
	});

	it('analyzes independent allowlisted intrinsic property messages', () => {
		const result = analyzeIntlSource(
			`export function Search({ count }) { return () => <>
				<input placeholder="Search messages" intl:placeholder />
				<button aria-label={count === 1 ? \`Delete \${count} message\` : \`Delete \${count} messages\`} intl:aria-label={{ name: 'delete-control' }} />
			</>; }`,
			{ filename: '/src/Search.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors).toHaveLength(2);
		expect(result.descriptors[0]).toMatchObject({
			target: { kind: 'property', name: 'placeholder' },
			source: [{ kind: 'text', value: 'Search messages' }]
		});
		expect(result.descriptors[1]).toMatchObject({
			target: { kind: 'property', name: 'aria-label' },
			name: 'delete-control',
			bindings: [{ index: 0, kind: 'selector', type: 'number' }]
		});
		expect(result.code).toContain('placeholder="Search messages"');
		expect(result.code).toContain('__exactIntl:placeholder={__exactPrepareIntl');
		expect(result.code).toContain('__exactIntl:aria-label={__exactPrepareIntl');
	});

	it('rejects property messages without a same-host intrinsic fallback', () => {
		const result = analyzeIntlSource(
			`export function Search() { return () => <Field intl:placeholder />; }`,
			{ filename: '/src/Search.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.descriptors).toEqual([]);
		expect(result.diagnostics[0]?.message).toContain('only on a direct intrinsic');
	});

	it('infers baseline and semantic-sup ordinal suffix projections', () => {
		const result = analyzeIntlSource(
			`export function Placement({ position }) { return () => <>
				<p intl:message>You placed {position}{position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}.</p>
				<p intl:message>You placed {position}<sup>{position === 1 ? 'ˢᵗ' : position === 2 ? 'ⁿᵈ' : position === 3 ? 'ʳᵈ' : 'ᵗʰ'}</sup>.</p>
			</>; }`,
			{ filename: '/src/Placement.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.bindings).toEqual([
			{ index: 0, kind: 'selector', type: 'number' }
		]);
		expect(result.descriptors[0]?.source).toContainEqual(
			expect.objectContaining({ kind: 'select', selection: 'plural-ordinal' })
		);
		expect(result.descriptors[1]?.source).toContainEqual(
			expect.objectContaining({
				kind: 'element',
				value: [expect.objectContaining({ kind: 'select', selection: 'plural-ordinal' })]
			})
		);
	});

	it('infers direct Temporal duration and native relative-time formatting', () => {
		const result = analyzeIntlSource(
			`export function Timing(duration: Temporal.Duration) { return () => <p intl:message>
				Took {duration}; posted {new Intl.RelativeTimeFormat('en-US', { numeric: 'always' }).format(-5, 'minutes')}.
			</p>; }`,
			{ filename: '/src/Timing.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'format', formatter: { kind: 'duration', options: {} } }),
				expect.objectContaining({
					kind: 'format',
					formatter: expect.objectContaining({ kind: 'relative-time' })
				})
			])
		);
	});

	it('compacts a finite Temporal relative-duration fallback into one reader', () => {
		const result = analyzeIntlSource(
			`export function Posted(duration: Temporal.Duration) { return () => <p intl:message>Posted {
				Math.abs(duration.years) > 0 ? \`\${Math.abs(duration.years)} year\${Math.abs(duration.years) === 1 ? '' : 's'} ago\` :
				Math.abs(duration.months) > 0 ? \`\${Math.abs(duration.months)} month\${Math.abs(duration.months) === 1 ? '' : 's'} ago\` :
				Math.abs(duration.days) > 0 ? \`\${Math.abs(duration.days)} day\${Math.abs(duration.days) === 1 ? '' : 's'} ago\` :
				'just now'
			}</p>; }`,
			{ filename: '/src/Posted.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.bindings).toEqual([
			{ index: 0, kind: 'value', type: 'temporal-duration' }
		]);
		expect(result.descriptors[0]?.source).toContainEqual({
			kind: 'format',
			bindings: [0],
			formatter: {
				kind: 'relative-duration',
				fields: ['years', 'months', 'days'],
				zero: 'just now',
				options: { numeric: 'always' }
			}
		});
		expect(result.code.match(/\[duration\]/g)).toHaveLength(1);
	});

	it('summarizes the equivalent local array/find relative-time helper', () => {
		const result = analyzeIntlSource(
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
			{ filename: '/src/PostedHelper.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toContainEqual(
			expect.objectContaining({
				kind: 'format',
				bindings: [0],
				formatter: expect.objectContaining({
					kind: 'relative-duration',
					fields: ['years', 'months', 'days', 'hours', 'minutes', 'seconds'],
					zero: 'just now'
				})
			})
		);
		expect(result.code.match(/\[duration\]/g)).toHaveLength(1);
		expect(result.clientRequirements).toEqual(['temporal']);
	});

	it('leaves component descendants untouched and reports the unsupported region', () => {
		const source = 'const View = () => <p intl:message>Hello <UserName /></p>;';
		const result = analyzeIntlSource(source, {
			filename: '/src/View.tsx',
			owner: 'example',
			sourceLocale: 'en-US'
		});
		expect(result.code).toBe(source);
		expect(result.descriptors).toHaveLength(0);
		expect(result.diagnostics[0]?.message).toContain('not yet supported');
	});

	it('moves an explicitly named opaque component range without analyzing its descendants', () => {
		const source =
			'const View = () => <p intl:message>Welcome, <_ intl:fragment="user"><UserBadge /></_>.</p>;';
		const result = analyzeIntlSource(source, {
			filename: '/src/View.tsx',
			owner: 'example',
			sourceLocale: 'en-US'
		});
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toEqual([
			{ kind: 'text', value: 'Welcome, ' },
			{ kind: 'opaque', binding: 0, name: 'user' },
			{ kind: 'text', value: '.' }
		]);
		expect(result.descriptors[0]?.bindings[0]).toEqual({
			index: 0,
			kind: 'opaque',
			type: 'opaque-structure',
			name: 'user',
			exactlyOnce: true
		});
		expect(result.code).toContain('() => <_><UserBadge /></_>');
		expect(result.code).not.toContain('intl:fragment');
	});

	it('emits a movable factory for a direct intrinsic without descending into components', () => {
		const result = analyzeIntlSource(
			'const View = () => <p intl:message>Read <a href={url}>terms</a></p>;',
			{ filename: '/src/View.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toEqual([
			{ kind: 'text', value: 'Read ' },
			{ kind: 'element', binding: 0, value: [{ kind: 'text', value: 'terms' }] }
		]);
		expect(result.code).toContain('__intlChildren => <a href={url}>{__intlChildren}</a>');
	});
});
