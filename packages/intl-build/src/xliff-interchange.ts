import type {
	IntlCatalogV1,
	IntlPatternNodeV1,
	IntlPatternV1,
	IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import { validateIntlCatalog } from '@exactjs/intl/internal';
import { translatorVisibleDescriptors } from './translator-visibility.js';
import {
	childElement,
	childElements,
	compactStructuralWhitespace,
	escapeXml,
	indent,
	localName,
	numericAttribute,
	parseXml,
	requiredAttribute,
	requiredChild,
	serializeElement,
	type XmlElement
} from './xliff-xml.js';

const xliffNamespace = 'urn:oasis:names:tc:xliff:document:2.0';

/** Inputs used to synchronize one bilingual XLIFF translation catalog. */
export interface XliffCatalogSynchronizationOptions {
	readonly owner: string;
	readonly locale: string;
}

/** Inputs used to extract one source-only XLIFF translation request. */
export interface XliffSourceCatalogOptions {
	readonly owner: string;
}

/** Extracts every owned source message as targetless XLIFF 2.1 translation input. */
export function exportXliff21SourceCatalog(
	descriptors: readonly IntlRuntimeDescriptorV1[],
	options: XliffSourceCatalogOptions
): string {
	const relevant = translatorVisibleDescriptors(descriptors, options.owner);
	return xliffDocument(
		options.owner,
		undefined,
		sourceLocaleFor(options.owner, descriptors),
		relevant.map((descriptor) => xliffUnit(descriptor, undefined, undefined, undefined))
	);
}

/** Serializes a validated runtime catalog as translator-visible XLIFF 2.1. */
export function exportXliff21Catalog(
	catalogInput: unknown,
	descriptors: readonly IntlRuntimeDescriptorV1[]
): string {
	const catalog = validateIntlCatalog(catalogInput, descriptors);
	const relevant = translatorVisibleDescriptors(descriptors, catalog.owner).filter(
		(descriptor) => catalog.messages[descriptor.key]
	);
	return xliffDocument(
		catalog.owner,
		catalog.locale,
		sourceLocaleFor(catalog.owner, descriptors),
		relevant.map((descriptor) =>
			xliffUnit(descriptor, catalog.messages[descriptor.key], undefined, undefined)
		)
	);
}

/** Imports translator-authored XLIFF targets and lowers them to a validated runtime catalog. */
export function importXliff21Catalog(
	input: string,
	descriptors: readonly IntlRuntimeDescriptorV1[]
): IntlCatalogV1 {
	const document = parseXml(input);
	requireXliffDocument(document);
	const locale = requiredAttribute(document, 'trgLang');
	const file = requiredChild(document, 'file');
	const owner = xliffFileOwner(file);
	const contracts = new Map(
		descriptors
			.filter((descriptor) => descriptor.owner === owner)
			.map((descriptor) => [descriptor.key, descriptor])
	);
	const messages: Record<string, IntlPatternV1> = Object.create(null) as Record<
		string,
		IntlPatternV1
	>;
	const seen = new Set<string>();
	for (const unit of childElements(file, 'unit')) {
		const key = requiredAttribute(unit, 'id');
		if (seen.has(key)) throw new TypeError(`XLIFF contains duplicate unit ${key}`);
		seen.add(key);
		if (unit.attributes.type === 'exact:obsolete' || unit.attributes['exact:obsolete'] === 'true')
			continue;
		const descriptor = contracts.get(key);
		if (!descriptor) continue;
		const segment = requiredChild(unit, 'segment');
		const target = childElement(segment, 'target');
		if (!target || target.children.length === 0) continue;
		messages[key] = decodePattern(target.children, originalData(unit));
	}
	return validateIntlCatalog({ protocol: 1, locale, owner, messages }, descriptors);
}

/** Merges current source descriptors into XLIFF while preserving valid targets, notes, and history. */
export function synchronizeXliff21Catalog(
	input: string | undefined,
	descriptors: readonly IntlRuntimeDescriptorV1[],
	options: XliffCatalogSynchronizationOptions
): string {
	const relevant = translatorVisibleDescriptors(descriptors, options.owner);
	const existing = input?.trim() ? parseXml(input) : undefined;
	if (existing) {
		requireXliffDocument(existing);
		if (requiredAttribute(existing, 'trgLang') !== options.locale)
			throw new TypeError(`XLIFF target locale does not match ${options.locale}`);
		if (xliffFileOwner(requiredChild(existing, 'file')) !== options.owner)
			throw new TypeError(`XLIFF owner does not match ${options.owner}`);
	}
	const existingUnits = new Map<string, XmlElement>();
	const file = existing && requiredChild(existing, 'file');
	if (file)
		for (const unit of childElements(file, 'unit'))
			existingUnits.set(requiredAttribute(unit, 'id'), unit);
	const active = new Set(relevant.map((descriptor) => descriptor.key));
	const currentDescriptorKeys = new Set(
		descriptors
			.filter((descriptor) => descriptor.owner === options.owner)
			.map((descriptor) => descriptor.key)
	);
	const units = relevant.map((descriptor) => {
		const previous = existingUnits.get(descriptor.key);
		const previousSegment = previous && childElement(previous, 'segment');
		const target = previousSegment && childElement(previousSegment, 'target');
		const notes = previous && childElement(previous, 'notes');
		return xliffUnit(
			descriptor,
			target && previous ? decodePattern(target.children, originalData(previous)) : undefined,
			notes ? serializeElement(notes) : undefined,
			previousSegment?.attributes.state
		);
	});
	for (const [key, unit] of existingUnits) {
		if (active.has(key)) continue;
		if (currentDescriptorKeys.has(key)) continue;
		units.push(
			serializeElement(
				compactStructuralWhitespace(
					sanitizeObsoleteElement({
						...unit,
						attributes: {
							...unit.attributes,
							translate: 'no',
							type: 'exact:obsolete'
						}
					})
				)
			)
		);
	}
	return xliffDocument(
		options.owner,
		options.locale,
		sourceLocaleFor(options.owner, descriptors),
		units
	);
}

function xliffDocument(
	owner: string,
	locale: string | undefined,
	sourceLocale: string,
	units: readonly string[]
): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="${xliffNamespace}" version="2.1" srcLang="${escapeXml(sourceLocale)}"${locale ? ` trgLang="${escapeXml(locale)}"` : ''}>
  <file id="f1" original="${escapeXml(owner)}">
${units.map((unit) => indent(unit, 4)).join('\n')}
  </file>
</xliff>
`;
}

function xliffUnit(
	descriptor: IntlRuntimeDescriptorV1,
	target: IntlPatternV1 | undefined,
	notes: string | undefined,
	state: string | undefined
): string {
	const data: string[] = [];
	const sourceMarkup = encodePattern(descriptor.source, 'n', data);
	const targetMarkup = target && encodePattern(target, 't', data);
	return `<unit id="${escapeXml(descriptor.key)}">
${notes ? indent(notes, 2) + '\n' : ''}${data.length ? `  <originalData>${data.join('')}</originalData>\n` : ''}  <segment${state ? ` state="${escapeXml(state)}"` : ''}>
    <source>${sourceMarkup}</source>
${targetMarkup === undefined ? '' : `    <target>${targetMarkup}</target>\n`}  </segment>
</unit>`;
}

function encodePattern(pattern: IntlPatternV1, path: string, data: string[]): string {
	return pattern.map((node, index) => encodeNode(node, `${path}${index}`, data)).join('');
}

function encodeNode(node: IntlPatternNodeV1, id: string, data: string[]): string {
	switch (node.kind) {
		case 'text':
			return escapeXml(node.value);
		case 'value':
			return `<ph id="${id}" type="ui" subType="exact:value" equiv="{${node.binding}}" dataRef="${originalDataReference(node, data)}" canCopy="no" canDelete="no"/>`;
		case 'format':
			return `<ph id="${id}" type="ui" subType="exact:format" equiv="{${node.bindings.join(',')}}" dataRef="${originalDataReference(node, data)}" canCopy="no" canDelete="no"/>`;
		case 'opaque':
			return `<ph id="${id}" type="ui" subType="exact:opaque" equiv="{${escapeXml(node.name)}}" dataRef="${originalDataReference(node, data)}" canCopy="no" canDelete="no"/>`;
		case 'element':
			return `<pc id="${id}" type="other" subType="exact:element" dataRefStart="${originalDataReference({ kind: node.kind, binding: node.binding }, data)}" canCopy="no" canDelete="no">${encodePattern(node.value, `${id}.`, data)}</pc>`;
		case 'select':
			return `<pc id="${id}" type="other" subType="exact:select" dataRefStart="${originalDataReference({ kind: node.kind, binding: node.binding, ...(node.rangeBinding === undefined ? {} : { rangeBinding: node.rangeBinding }), selection: node.selection }, data)}" canCopy="no" canDelete="no">${node.cases.map((candidate, index) => `<mrk id="${id}.c${index}" type="exact:case" value="${escapeXml(candidate.key)}">${encodePattern(candidate.value, `${id}.c${index}.`, data)}</mrk>`).join('')}<mrk id="${id}.fallback" type="exact:fallback">${encodePattern(node.fallback, `${id}.f.`, data)}</mrk></pc>`;
	}
}

function originalDataReference(metadata: object, data: string[]): string {
	const id = `d${data.length}`;
	data.push(`<data id="${id}">${escapeXml(JSON.stringify(metadata))}</data>`);
	return id;
}

function decodePattern(
	children: readonly (XmlElement | string)[],
	data: ReadonlyMap<string, string>
): IntlPatternV1 {
	return children.flatMap((child): IntlPatternNodeV1[] => {
		if (typeof child === 'string') return child ? [{ kind: 'text', value: child }] : [];
		const metadata = inlineMetadata(child, data);
		if (localName(child.name) === 'ph') {
			if (metadata.kind === 'value' || metadata.kind === 'opaque' || metadata.kind === 'format')
				return [metadata];
		}
		if (localName(child.name) === 'pc' && metadata.kind === 'element')
			return [
				{
					kind: 'element',
					binding: metadata.binding,
					value: decodePattern(child.children, data)
				}
			];
		if (localName(child.name) === 'pc' && metadata.kind === 'select') {
			const cases: { key: string; value: IntlPatternV1 }[] = [];
			let fallback: IntlPatternV1 | undefined;
			for (const branch of child.children) {
				if (typeof branch === 'string') {
					if (branch.trim())
						throw new TypeError('XLIFF select containers may contain only marked branches');
					continue;
				}
				if (localName(branch.name) !== 'mrk')
					throw new TypeError('XLIFF select branch must use mrk');
				if (
					branch.attributes.type === 'exact:fallback' ||
					branch.attributes['exact:fallback'] === 'true'
				)
					fallback = decodePattern(branch.children, data);
				else
					cases.push({
						key: branch.attributes.value ?? requiredAttribute(branch, 'exact:key'),
						value: decodePattern(branch.children, data)
					});
			}
			if (!fallback) throw new TypeError('XLIFF select container requires one fallback branch');
			return [
				{
					kind: 'select',
					binding: metadata.binding,
					...(metadata.rangeBinding === undefined ? {} : { rangeBinding: metadata.rangeBinding }),
					selection: metadata.selection,
					cases,
					fallback
				}
			];
		}
		throw new TypeError(`Unsupported XLIFF inline code ${child.name}`);
	});
}

function inlineMetadata(
	element: XmlElement,
	data: ReadonlyMap<string, string>
):
	| Exclude<IntlPatternNodeV1, { kind: 'text' | 'element' | 'select' }>
	| {
			readonly kind: 'element';
			readonly binding: number;
	  }
	| {
			readonly kind: 'select';
			readonly binding: number;
			readonly rangeBinding?: number;
			readonly selection: Extract<IntlPatternNodeV1, { kind: 'select' }>['selection'];
	  } {
	const reference = element.attributes.dataRef ?? element.attributes.dataRefStart;
	if (reference) {
		const input = data.get(reference);
		if (!input)
			throw new TypeError(`XLIFF inline code references missing original data ${reference}`);
		return JSON.parse(input) as ReturnType<typeof inlineMetadata>;
	}
	return legacyInlineMetadata(element);
}

function legacyInlineMetadata(element: XmlElement): ReturnType<typeof inlineMetadata> {
	const kind = requiredAttribute(element, 'exact:kind');
	if (kind === 'value') return { kind, binding: numericAttribute(element, 'exact:binding') };
	if (kind === 'opaque')
		return {
			kind,
			binding: numericAttribute(element, 'exact:binding'),
			name: requiredAttribute(element, 'exact:name')
		};
	if (kind === 'format')
		return JSON.parse(requiredAttribute(element, 'exact:data')) as ReturnType<
			typeof inlineMetadata
		>;
	if (kind === 'element') return { kind, binding: numericAttribute(element, 'exact:binding') };
	if (kind === 'select')
		return {
			kind,
			binding: numericAttribute(element, 'exact:binding'),
			selection: requiredAttribute(element, 'exact:selection') as
				| 'boolean'
				| 'exact'
				| 'plural-cardinal'
				| 'plural-ordinal'
				| 'plural-range-cardinal'
				| 'plural-range-ordinal'
		};
	throw new TypeError(`Unsupported eXact inline code kind ${kind}`);
}

function requireXliffDocument(document: XmlElement): void {
	if (
		localName(document.name) !== 'xliff' ||
		document.attributes.xmlns !== xliffNamespace ||
		document.attributes.version !== '2.1'
	)
		throw new TypeError('XLIFF interchange must be an XLIFF 2.1 document');
}

function originalData(unit: XmlElement): ReadonlyMap<string, string> {
	const result = new Map<string, string>();
	const container = childElement(unit, 'originalData');
	if (!container) return result;
	for (const entry of childElements(container, 'data')) {
		const id = requiredAttribute(entry, 'id');
		if (result.has(id)) throw new TypeError(`XLIFF original data contains duplicate id ${id}`);
		if (entry.children.some((child) => typeof child !== 'string'))
			throw new TypeError('eXact XLIFF original data must contain JSON text');
		result.set(id, entry.children.join(''));
	}
	return result;
}

function sourceLocaleFor(owner: string, descriptors: readonly IntlRuntimeDescriptorV1[]): string {
	const locales = new Set(
		descriptors
			.filter((descriptor) => descriptor.owner === owner)
			.map((descriptor) => descriptor.sourceLocale)
	);
	if (locales.size !== 1) throw new TypeError(`Catalog owner ${owner} must have one source locale`);
	return [...locales][0]!;
}

function xliffFileOwner(file: XmlElement): string {
	return file.attributes.original ?? requiredAttribute(file, 'id');
}

function withoutExactAttributes(
	attributes: Readonly<Record<string, string>>
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(attributes).filter(([name]) => !name.startsWith('exact:'))
	);
}

function sanitizeObsoleteElement(element: XmlElement): XmlElement {
	const name = localName(element.name);
	const legacyKind = element.attributes['exact:kind'];
	const attributes = withoutExactAttributes(element.attributes);
	if (name === 'ph' && legacyKind) {
		attributes.type = 'ui';
		attributes.subType = `exact:${legacyKind}`;
		attributes.canCopy = 'no';
		attributes.canDelete = 'no';
	}
	if (name === 'pc' && legacyKind) {
		attributes.type = 'other';
		attributes.subType = `exact:${legacyKind}`;
		attributes.canCopy = 'no';
		attributes.canDelete = 'no';
	}
	if (name === 'mrk') {
		if (element.attributes['exact:fallback'] === 'true') attributes.type = 'exact:fallback';
		else if (element.attributes['exact:key']) {
			attributes.type = 'exact:case';
			attributes.value = element.attributes['exact:key'];
		}
	}
	return {
		...element,
		attributes,
		children: element.children.map((child) =>
			typeof child === 'string' ? child : sanitizeObsoleteElement(child)
		)
	};
}
