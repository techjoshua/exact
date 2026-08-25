import { projectIntlTranslationContract, type IntlRuntimeDescriptorV1 } from '@exactjs/intl';
import { validateIntlCatalog } from '@exactjs/intl/internal';
import { analyzeIntlSource } from '@exactjs/intl-analyzer';
import { describe, expect, it } from 'vitest';
import { exactJsonCatalogInterchange, xliff21CatalogInterchange } from './catalog-interchange.js';
import { exportXliff21SourceCatalog, synchronizeXliff21Catalog } from './xliff-interchange.js';

const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: '@acme/card',
	occurrenceId: 'Card:0',
	contract: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
	key: 'example_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [],
	source: [{ kind: 'text', value: 'Hello & welcome' }],
	capabilities: []
};

const catalog = {
	protocol: 1,
	locale: 'fr',
	owner: '@acme/card',
	messages: { [descriptor.key]: [{ kind: 'text', value: 'Bonjour <ami>' }] }
};

describe('intl catalog interchange', () => {
	it('exports one XLIFF unit for a message with nested plural and unit contributions', () => {
		const analysis = analyzeIntlSource(
			`export function Summary(props: { count: number; distance: number }) { return () =>
				<p intl:message="summary">
					<_ intl:plural={props.count}>{props.count === 1 ? 'One message' : \`\${props.count} messages\`}</_>
					across <span intl:unit="distance-road">{props.distance} miles</span>.
				</p>;
			}`,
			{ filename: '/src/Summary.tsx', owner: '@acme/card', sourceLocale: 'en-US' }
		);

		expect(analysis.diagnostics).toEqual([]);
		expect(analysis.descriptors).toHaveLength(1);
		const encoded = exportXliff21SourceCatalog(analysis.descriptors, { owner: '@acme/card' });
		expect(encoded.match(/<unit /gu)).toHaveLength(1);
		expect(encoded.match(/equivStart="\{plural-cardinal\}"/gu)).toHaveLength(1);
		expect(encoded).toContain('equivStart="{plural-cardinal}"');
		expect(encoded).toContain('equivStart="&lt;span&gt;"');
		expect(encoded).toContain('equiv="{unit}"');
	});

	it('round-trips validated protocol JSON', () => {
		const encoded = exactJsonCatalogInterchange.exportCatalog(catalog, [descriptor]);
		expect(exactJsonCatalogInterchange.importCatalog(encoded, [descriptor])).toMatchObject(catalog);
	});

	it('round-trips plain translations through XLIFF 2.1 escaping', () => {
		const encoded = xliff21CatalogInterchange.exportCatalog(catalog, [descriptor]);
		expect(encoded).toContain('version="2.1"');
		expect(encoded).toContain('Bonjour &lt;ami&gt;');
		expect(xliff21CatalogInterchange.importCatalog(encoded, [descriptor])).toMatchObject(catalog);
	});

	it('round-trips plural-range translations without exposing execution metadata', () => {
		const rangeDescriptor: IntlRuntimeDescriptorV1 = {
			...descriptor,
			key: 'range_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
			bindings: [
				{ index: 0, kind: 'selector', type: 'number' },
				{ index: 1, kind: 'selector', type: 'number' }
			],
			source: [
				{
					kind: 'select',
					binding: 0,
					rangeBinding: 1,
					selection: 'plural-range-cardinal',
					cases: [{ key: 'few', value: [{ kind: 'text', value: 'few' }] }],
					fallback: [{ kind: 'text', value: 'other' }]
				}
			],
			capabilities: ['plural-range-cardinal']
		};
		const translated = {
			protocol: 1 as const,
			locale: 'pl-PL',
			owner: rangeDescriptor.owner,
			messages: {
				[rangeDescriptor.key]: projectIntlTranslationContract(
					rangeDescriptor.bindings,
					rangeDescriptor.source
				).source
			}
		};

		const encoded = xliff21CatalogInterchange.exportCatalog(translated, [rangeDescriptor]);
		expect(encoded).toContain('equivStart="{plural-range-cardinal}"');
		expect(encoded).not.toContain('rangeBinding');
		expect(encoded).not.toContain('<originalData>');
		expect(xliff21CatalogInterchange.importCatalog(encoded, [rangeDescriptor])).toEqual(
			validateIntlCatalog(translated, [rangeDescriptor])
		);
	});

	it('lets a fixed source ordinal wrapper gain target-locale category branches', () => {
		const ordinalDescriptor: IntlRuntimeDescriptorV1 = {
			...descriptor,
			key: 'ordinal_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
			sourceLocale: 'ja-JP',
			bindings: [{ index: 0, kind: 'selector', type: 'number' }],
			source: [
				{
					kind: 'select',
					binding: 0,
					selection: 'plural-ordinal',
					cases: [],
					fallback: [
						{ kind: 'text', value: '第' },
						{ kind: 'value', binding: 0 },
						{ kind: 'text', value: '位' }
					]
				}
			],
			capabilities: ['plural-ordinal']
		};
		const translated = {
			protocol: 1 as const,
			locale: 'en-US',
			owner: ordinalDescriptor.owner,
			messages: {
				[ordinalDescriptor.key]: [
					{
						kind: 'select' as const,
						id: 'n0',
						cases: [
							{
								key: 'one',
								value: [
									{ kind: 'placeholder' as const, id: 'n0.f.1' },
									{ kind: 'text' as const, value: 'st' }
								]
							}
						],
						fallback: [
							{ kind: 'placeholder' as const, id: 'n0.f.1' },
							{ kind: 'text' as const, value: 'th' }
						]
					}
				]
			}
		};

		const encoded = xliff21CatalogInterchange.exportCatalog(translated, [ordinalDescriptor]);
		expect(encoded).toContain('value="one"');
		expect(xliff21CatalogInterchange.importCatalog(encoded, [ordinalDescriptor])).toEqual(
			validateIntlCatalog(translated, [ordinalDescriptor])
		);
	});

	it('extracts a source-only XLIFF translation request without inventing a target', () => {
		const formatterOnly: IntlRuntimeDescriptorV1 = {
			...descriptor,
			key: 'formatter_EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
			bindings: [{ index: 0, kind: 'value', type: 'number' }],
			capabilities: ['currency'],
			source: [
				{
					kind: 'format',
					bindings: [0],
					formatter: {
						kind: 'currency',
						currency: 'USD',
						display: 'symbol',
						options: {}
					}
				}
			]
		};
		const encoded = exportXliff21SourceCatalog([descriptor, formatterOnly], {
			owner: descriptor.owner
		});
		expect(encoded).toContain('srcLang="en-US"');
		expect(encoded).not.toContain('trgLang=');
		expect(encoded).toContain('<source>Hello &amp; welcome</source>');
		expect(encoded).not.toContain('m1_formatter_only');
		expect(encoded).not.toContain('<target>');

		const obsoleteFormatterUnit = xliff21CatalogInterchange
			.exportCatalog(catalog, [descriptor])
			.replaceAll(descriptor.key, formatterOnly.key);
		const synchronized = synchronizeXliff21Catalog(obsoleteFormatterUnit, [formatterOnly], {
			owner: descriptor.owner,
			locale: 'fr'
		});
		expect(synchronized).not.toContain(formatterOnly.key);
		expect(synchronized).not.toContain('type="exact:obsolete"');
	});

	it('round-trips translator-visible values, elements, selectors, and formatter placeholders', () => {
		const structured: IntlRuntimeDescriptorV1 = {
			...descriptor,
			key: 'structured_FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
			bindings: [
				{ index: 0, kind: 'selector', type: 'number' },
				{ index: 1, kind: 'element', type: 'structure', name: 'link', exactlyOnce: true },
				{ index: 2, kind: 'value', type: 'measurement' }
			],
			capabilities: ['plural-cardinal', 'element', 'unit'],
			source: [
				{ kind: 'text', value: 'You have ' },
				{ kind: 'value', binding: 0 },
				{
					kind: 'select',
					binding: 0,
					selection: 'plural-cardinal',
					cases: [{ key: '=1', value: [{ kind: 'text', value: ' message in ' }] }],
					fallback: [{ kind: 'text', value: ' messages in ' }]
				},
				{ kind: 'element', binding: 1, value: [{ kind: 'text', value: 'the inbox' }] },
				{ kind: 'text', value: ' over ' },
				{
					kind: 'format',
					bindings: [2],
					formatter: {
						kind: 'unit',
						quantity: 'length',
						usage: 'road',
						sourceUnit: 'mile',
						precision: 'source',
						options: {}
					}
				}
			]
		};
		const translated = {
			protocol: 1,
			locale: 'fr',
			owner: structured.owner,
			messages: {
				[structured.key]: projectIntlTranslationContract(structured.bindings, structured.source)
					.source
			}
		};
		const encoded = xliff21CatalogInterchange.exportCatalog(translated, [structured]);
		expect(encoded).toContain('<file id="f1" original="@acme/card">');
		expect(encoded).toContain('<ph id="n1" equiv="{value-0}"');
		expect(encoded).toContain('<pc id="n2" equivStart="{plural-cardinal}"');
		expect(encoded).toContain('<pc id="n3" equivStart="&lt;link&gt;"');
		expect(encoded).not.toContain('<originalData>');
		expect(encoded).not.toContain('dataRef=');
		expect(encoded).not.toContain('subType=');
		expect(encoded).not.toContain('xmlns:exact');
		expect(encoded).not.toMatch(/\sexact:[\w-]+=/u);
		expect(xliff21CatalogInterchange.importCatalog(encoded, [structured])).toEqual(
			validateIntlCatalog(translated, [structured])
		);
	});

	it('preserves current targets and removes units absent from current source', () => {
		const initial = xliff21CatalogInterchange
			.exportCatalog(catalog, [descriptor])
			.replace(
				'  <segment>',
				'  <notes><note>Reviewed by Mina</note></notes>\n  <segment state="reviewed">'
			);
		const retained = synchronizeXliff21Catalog(initial, [descriptor], {
			owner: descriptor.owner,
			locale: 'fr'
		});
		expect(retained).toContain('<segment state="reviewed">');
		expect(retained).toContain('<target>Bonjour &lt;ami&gt;</target>');
		expect(retained).toContain('Reviewed by Mina');

		const next: IntlRuntimeDescriptorV1 = {
			...descriptor,
			key: 'next_GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
			occurrenceId: 'Card:1'
		};
		const synchronized = synchronizeXliff21Catalog(retained, [next], {
			owner: descriptor.owner,
			locale: 'fr'
		});
		expect(synchronized).toContain(`id="${next.key}"`);
		expect(synchronized).not.toContain(descriptor.key);
		expect(synchronized).not.toContain('exact:obsolete');
		expect(synchronized).not.toContain('Reviewed by Mina');
		expect(
			synchronizeXliff21Catalog(synchronized, [next], {
				owner: descriptor.owner,
				locale: 'fr'
			})
		).toBe(synchronized);
	});

	it('rejects superseded eXact runtime metadata instead of migrating it', () => {
		const input = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" xmlns:exact="https://exactjs.dev/intl/xliff/1" version="2.1" srcLang="en-US" trgLang="fr">
  <file id="f1" original="@acme/card">
    <unit id="${descriptor.key}">
      <segment><source>Hello &amp; welcome</source><target exact:binding="0">Bonjour</target></segment>
    </unit>
  </file>
</xliff>`;

		expect(() => xliff21CatalogInterchange.importCatalog(input, [descriptor])).toThrow(
			'unsupported eXact runtime metadata'
		);
	});

	it('rejects XLIFF entity declarations before parsing translation data', () => {
		expect(() =>
			xliff21CatalogInterchange.importCatalog('<!DOCTYPE x [<!ENTITY unsafe "value">]>', [
				descriptor
			])
		).toThrow('must not contain');
	});
});
