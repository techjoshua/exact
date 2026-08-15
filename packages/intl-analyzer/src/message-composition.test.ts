import { describe, expect, it } from 'vitest';
import { analyzeIntlSource } from './index.js';

describe('lexical intl message composition', () => {
	it('composes nested selector and formatter enhancements into one lexical message', () => {
		const result = analyzeIntlSource(
			`export function Summary(props: { count: number; distance: number }) { return () =>
				<p intl:message="summary">
					You have <_ intl:plural={props.count}>{props.count === 1 ? 'one message' : \`\${props.count} messages\`}</_>
					across <span intl:unit="distance-road">{props.distance} miles</span>.
				</p>;
			}`,
			{ filename: '/src/Summary.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors).toHaveLength(1);
		expect(result.descriptors[0]).toMatchObject({
			name: 'summary',
			bindings: [
				{ index: 0, kind: 'selector', type: 'number' },
				{ index: 1, kind: 'value', type: 'measurement' },
				{ index: 2, kind: 'element', type: 'structure', name: 'span', exactlyOnce: true }
			],
			capabilities: ['element', 'plural-cardinal', 'unit']
		});
		expect(result.descriptors[0]?.source).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'select', binding: 0, selection: 'plural-cardinal' }),
				expect.objectContaining({
					kind: 'element',
					binding: 2,
					value: [
						expect.objectContaining({
							kind: 'format',
							bindings: [1],
							formatter: expect.objectContaining({ kind: 'unit', sourceUnit: 'mile' })
						})
					]
				})
			])
		);
		expect(result.code.match(/__exactPrepareIntl\(/gu)).toHaveLength(1);
		expect(result.code).not.toContain('intl:plural');
		expect(result.code).not.toContain('intl:unit');
	});

	it('composes nested select, currency, and CLDR roles into the enclosing message', () => {
		const result = analyzeIntlSource(
			`export function Account(props: { role: string; total: number; height: number }) { return () =>
				<section intl:message="account-summary">
					Role: <_ intl:select={props.role}>{props.role}</_>.
					Budget: <strong intl:currency="USD">$ {props.total}</strong>.
					Height: <span intl:cldr="length/person-height">{props.height} inches</span>.
				</section>;
			}`,
			{ filename: '/src/Account.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors).toHaveLength(1);
		expect(result.descriptors[0]).toMatchObject({
			name: 'account-summary',
			capabilities: ['currency', 'element', 'exact', 'unit']
		});
		expect(result.descriptors[0]?.source).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'select', selection: 'exact' }),
				expect.objectContaining({ kind: 'element' }),
				expect.objectContaining({ kind: 'element' })
			])
		);
		expect(result.code.match(/__exactPrepareIntl\(/gu)).toHaveLength(1);
		for (const role of ['select', 'currency', 'cldr'])
			expect(result.code).not.toContain(`intl:${role}`);
	});

	it('creates an implicit named message for a standalone plural enhancement', () => {
		const result = analyzeIntlSource(
			`export function Inbox(props: { count: number }) { return () =>
				<p intl:plural={{ value: props.count, name: 'inbox-count' }}>
					You have {props.count ? \`\${props.count}\` : 'no'} new {props.count === 1 ? 'message' : 'messages'}.
				</p>;
			}`,
			{ filename: '/src/Inbox.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors).toHaveLength(1);
		expect(result.descriptors[0]).toMatchObject({
			name: 'inbox-count',
			bindings: [{ index: 0, kind: 'selector', type: 'number' }],
			source: [expect.objectContaining({ kind: 'select', selection: 'plural-cardinal' })]
		});
		expect(result.descriptors[0]?.key).toMatch(/^inbox-count_/u);
	});

	it('uses a message name with a co-targeted specialized enhancement', () => {
		const result = analyzeIntlSource(
			`export function Distance(value: number) { return () =>
				<output intl:message="road-distance" intl:unit="distance-road">{value} miles</output>;
			}`,
			{ filename: '/src/Distance.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors).toHaveLength(1);
		expect(result.descriptors[0]).toMatchObject({
			name: 'road-distance',
			source: [
				expect.objectContaining({
					kind: 'format',
					formatter: expect.objectContaining({ kind: 'unit' })
				})
			]
		});
		expect(result.code).not.toContain('intl:unit');
	});

	it('creates an implicit exact-selection message for a standalone select enhancement', () => {
		const result = analyzeIntlSource(
			`export function Status(props: { state: string }) { return () =>
				<p intl:select={{ value: props.state, name: 'delivery-state' }}>Delivery status: {props.state}.</p>;
			}`,
			{ filename: '/src/Status.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors).toHaveLength(1);
		expect(result.descriptors[0]).toMatchObject({
			name: 'delivery-state',
			bindings: [{ index: 0, kind: 'selector', type: 'string' }],
			source: [expect.objectContaining({ kind: 'select', selection: 'exact' })]
		});
	});

	it('deduplicates an explicit select role and its matching inferred fallback selector', () => {
		const result = analyzeIntlSource(
			`export function Role(props: { role: string }) { return () =>
				<p intl:message="role"><_ intl:select={props.role}>{props.role === 'owner' ? 'Owner' : 'Member'}</_></p>;
			}`,
			{ filename: '/src/Role.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors).toHaveLength(1);
		expect(
			JSON.stringify(result.descriptors[0]?.source).match(/"selection":"exact"/gu)
		).toHaveLength(1);
		expect(result.descriptors[0]?.source).toEqual([
			expect.objectContaining({
				kind: 'select',
				selection: 'exact',
				cases: [{ key: 'owner', value: [{ kind: 'text', value: 'Owner' }] }],
				fallback: [{ kind: 'text', value: 'Member' }]
			})
		]);
	});

	it('honors named object options for implicit currency and unit messages', () => {
		const result = analyzeIntlSource(
			`export function Values(props: { total: number; distance: number }) { return () => <>
				<output intl:currency={{ currency: 'CAD', display: 'narrowSymbol', name: 'total' }}>{props.total}</output>
				<span intl:unit={{ unit: 'distance-road', sourceUnit: 'mile', convertTo: 'kilometer', name: 'distance' }}>{props.distance}</span>
			</>; }`,
			{ filename: '/src/Values.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.descriptors).toHaveLength(2);
		expect(result.descriptors[0]).toMatchObject({
			name: 'total',
			source: [
				expect.objectContaining({
					formatter: expect.objectContaining({
						kind: 'currency',
						currency: 'CAD',
						display: 'narrowSymbol'
					})
				})
			]
		});
		expect(result.descriptors[1]).toMatchObject({
			name: 'distance',
			source: [
				expect.objectContaining({
					formatter: expect.objectContaining({
						kind: 'unit',
						sourceUnit: 'mile',
						convertTo: 'kilometer'
					})
				})
			]
		});
	});

	it('rejects multiple specialized roles on one content range', () => {
		const result = analyzeIntlSource(
			`export function Invalid(value: number) { return () =>
				<output intl:plural={value} intl:unit="distance-road">{value} miles</output>;
			}`,
			{ filename: '/src/Invalid.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(result.descriptors).toEqual([]);
		expect(result.diagnostics[0]?.message).toContain(
			'cannot declare more than one intl selector or formatter role'
		);
	});
});
