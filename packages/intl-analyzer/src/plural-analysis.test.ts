import { describe, expect, it } from 'vitest';
import { analyzeIntlSource } from './index.js';

describe('native plural and locale analysis', () => {
	it('keeps shorthand language-scoped while explicit native plural rules stay portable', () => {
		const shorthand = analyzeIntlSource(
			`export function Placement(position: number) { return () => <p intl:message>
				{position}{position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}
			</p>; }`,
			{ filename: '/src/FrenchShorthand.tsx', owner: 'example', sourceLocale: 'fr-FR' }
		);
		const explicit = analyzeIntlSource(
			`const rules = new Intl.PluralRules('fr-FR', { type: 'ordinal' });
			const suffixes = { one: 'er', other: 'e' };
			export function Placement(position: number) { return () => <p intl:message>
				{position}{suffixes[rules.select(position)]}
			</p>; }`,
			{ filename: '/src/FrenchExplicit.tsx', owner: 'example', sourceLocale: 'fr-FR' }
		);

		expect(JSON.stringify(shorthand.descriptors[0]?.source)).not.toContain('plural-ordinal');
		expect(JSON.stringify(explicit.descriptors[0]?.source)).toContain('plural-ordinal');
	});

	it.each([
		['ja-JP', '第{position}位', ['第', '位']],
		['es-MX', '{position}.º', ['.º']],
		['hi-IN', '{position}वाँ', ['वाँ']],
		['id-ID', 'ke-{position}', ['ke-']]
	])(
		'infers a fixed %s ordinal wrapper around a numeric placeholder',
		(sourceLocale, fallback, markers) => {
			const result = analyzeIntlSource(
				`export function Placement(position: number) { return () => <p intl:message>${fallback}</p>; }`,
				{ filename: `/src/Ordinal-${sourceLocale}.tsx`, owner: 'example', sourceLocale }
			);

			expect(result.diagnostics).toEqual([]);
			expect(result.descriptors[0]?.bindings).toEqual([
				{ index: 0, kind: 'selector', type: 'number' }
			]);
			const selection = result.descriptors[0]?.source.find((node) => node.kind === 'select');
			expect(selection).toMatchObject({
				kind: 'select',
				selection: 'plural-ordinal',
				cases: []
			});
			expect(JSON.stringify(selection)).toContain('"kind":"value","binding":0');
			for (const marker of markers) expect(JSON.stringify(selection)).toContain(marker);
		}
	);

	it('recognizes profiled full-word ordinal branches without treating them as universal', () => {
		const arabic = analyzeIntlSource(
			`export function Placement(position: number) { return () => <p intl:message>
				{position === 1 ? 'الأول' : position === 2 ? 'الثاني' : 'الثالث'}
			</p>; }`,
			{ filename: '/src/ArabicOrdinal.tsx', owner: 'example', sourceLocale: 'ar-EG' }
		);
		const english = analyzeIntlSource(
			`export function Placement(position: number) { return () => <p intl:message>
				{position === 1 ? 'الأول' : position === 2 ? 'الثاني' : 'الثالث'}
			</p>; }`,
			{ filename: '/src/EnglishArabicOrdinal.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(JSON.stringify(arabic.descriptors[0]?.source)).toContain('plural-ordinal');
		expect(JSON.stringify(english.descriptors[0]?.source)).not.toContain('plural-ordinal');
	});

	it('recognizes an explicit Intl.PluralRules ordinal projection', () => {
		const result = analyzeIntlSource(
			`const ordinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' });
			const suffixes = { zero: 'th', one: 'st', two: 'nd', few: 'rd', many: 'th', other: 'th' };
			export function Placement(position: number) { return () => <p intl:message>
				You placed {position}<sup>{suffixes[ordinalRules.select(position)]}</sup>.
			</p>; }`,
			{ filename: '/src/PlacementRules.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.bindings).toEqual([
			{ index: 0, kind: 'selector', type: 'number' },
			{
				index: 1,
				kind: 'element',
				type: 'structure',
				name: 'sup',
				exactlyOnce: true
			}
		]);
		expect(result.descriptors[0]?.source).toContainEqual(
			expect.objectContaining({
				kind: 'element',
				value: [
					expect.objectContaining({
						kind: 'select',
						selection: 'plural-ordinal',
						cases: expect.arrayContaining([
							{ key: 'one', value: [{ kind: 'text', value: 'st' }] },
							{ key: 'two', value: [{ kind: 'text', value: 'nd' }] },
							{ key: 'few', value: [{ kind: 'text', value: 'rd' }] }
						])
					})
				]
			})
		);
	});

	it('recognizes native cardinal and ordinal plural-range projections', () => {
		const result = analyzeIntlSource(
			`const cardinal = new Intl.PluralRules('sl-SI');
			const ordinal = new Intl.PluralRules('sl-SI', { type: 'ordinal' });
			const cardinalForms = { one: 'one-cardinal', two: 'two-cardinal', few: 'few-cardinal', other: 'other-cardinal' };
			const ordinalForms = { one: 'one-ordinal', two: 'two-ordinal', few: 'few-ordinal', other: 'other-ordinal' };
			export function Range(start: number, end: number) { return () => <p intl:message>
				{cardinalForms[cardinal.selectRange(start, end)]} / {ordinalForms[ordinal.selectRange(start, end)]}
			</p>; }`,
			{ filename: '/src/SlovenianRange.tsx', owner: 'example', sourceLocale: 'sl-SI' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.bindings).toEqual([
			{ index: 0, kind: 'selector', type: 'number' },
			{ index: 1, kind: 'selector', type: 'number' }
		]);
		expect(result.descriptors[0]?.source).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'select',
					binding: 0,
					rangeBinding: 1,
					selection: 'plural-range-cardinal'
				}),
				expect.objectContaining({
					kind: 'select',
					binding: 0,
					rangeBinding: 1,
					selection: 'plural-range-ordinal'
				})
			])
		);
	});

	it('diagnoses a static native Intl locale that conflicts with the source locale', () => {
		const result = analyzeIntlSource(
			`const rules = new Intl.PluralRules('fr-FR');
			const forms = { one: 'message', other: 'messages' };
			export function Inbox(count: number, when: Temporal.PlainDate) { return () => <p intl:message>
				{forms[rules.select(count)]} at {new Intl.NumberFormat('en-GB').format(count)}
				on {when.toLocaleString('de-DE')}
			</p>; }`,
			{ filename: '/src/Inbox.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.descriptors).toHaveLength(1);
		expect(result.diagnostics.map(({ message }) => message)).toEqual([
			'Intl.PluralRules locale "fr-FR" conflicts with the configured intl source locale "en-US"',
			'Intl.NumberFormat locale "en-GB" conflicts with the configured intl source locale "en-US"',
			'toLocaleString locale "de-DE" conflicts with the configured intl source locale "en-US"'
		]);
	});

	it('accepts a language-only native Intl locale compatible with the source locale', () => {
		const result = analyzeIntlSource(
			`const rules = new Intl.PluralRules('en');
			const forms = { one: 'message', other: 'messages' };
			export function Inbox(count: number) { return () => <p intl:message>{forms[rules.select(count)]}</p>; }`,
			{ filename: '/src/Inbox.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
	});

	it.each([
		'en-US',
		'es-MX',
		'pt-BR',
		'de-DE',
		'fr-FR',
		'pl-PL',
		'ru-RU',
		'uk-UA',
		'ar-EG',
		'hi-IN',
		'bn-BD',
		'ja-JP',
		'zh-Hans-CN',
		'ko-KR',
		'tr-TR',
		'id-ID'
	])('accepts native number intent for representative source locale %s', (locale) => {
		const result = analyzeIntlSource(
			`export function Amount(value: number) { return () => <p intl:message>
				{new Intl.NumberFormat('${locale}').format(value)}
			</p>; }`,
			{ filename: `/src/${locale}-Amount.tsx`, owner: 'example', sourceLocale: locale }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors[0]?.source).toEqual([
			expect.objectContaining({
				kind: 'format',
				formatter: { kind: 'number', options: {} }
			})
		]);
	});

	it.each([
		{
			locale: 'ar-EG',
			forms: {
				zero: 'لا رسائل',
				one: 'رسالة',
				two: 'رسالتان',
				few: 'رسائل',
				many: 'رسالة',
				other: 'رسالة'
			},
			categories: ['zero', 'one', 'two', 'few', 'many']
		},
		{
			locale: 'pl-PL',
			forms: { one: 'wiadomość', few: 'wiadomości', many: 'wiadomości', other: 'wiadomości' },
			categories: ['one', 'few', 'many']
		},
		{
			locale: 'fr-FR',
			forms: { one: 'message', many: 'messages', other: 'messages' },
			categories: ['one', 'many']
		},
		{
			locale: 'hi-IN',
			forms: { one: 'संदेश', other: 'संदेश' },
			categories: ['one']
		}
	] as const)(
		'recognizes a native cardinal PluralRules projection for $locale',
		({ locale, forms, categories }) => {
			const result = analyzeIntlSource(
				`const rules = new Intl.PluralRules('${locale}');
				const forms = ${JSON.stringify(forms)};
				export function Inbox(count: number) { return () => <p intl:message>{count} {forms[rules.select(count)]}</p>; }`,
				{ filename: `/src/${locale}-Inbox.tsx`, owner: 'example', sourceLocale: locale }
			);

			expect(result.diagnostics).toEqual([]);
			expect(result.descriptors[0]?.bindings).toEqual([
				{ index: 0, kind: 'selector', type: 'number' }
			]);
			expect(result.descriptors[0]?.source).toContainEqual(
				expect.objectContaining({
					kind: 'select',
					selection: 'plural-cardinal',
					cases: categories.map((key) =>
						expect.objectContaining({ key, value: [{ kind: 'text', value: forms[key] }] })
					)
				})
			);
		}
	);
});
