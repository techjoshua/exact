import {
	projectIntlTranslationContract,
	type IntlCatalogV1,
	type IntlRuntimeDescriptorV1,
	type IntlTranslationPatternNodeV1,
	type IntlTranslationPatternV1,
	type IntlTranslationPlaceholderV1
} from '@exactjs/intl';
import { validateIntlCatalog } from '@exactjs/intl/internal';
import { translatorVisibleDescriptors } from './translator-visibility.js';
import {
	childElement,
	childElements,
	escapeXml,
	indent,
	localName,
	parseXml,
	requiredAttribute,
	requiredChild,
	serializeElement,
	type XmlElement
} from '@exactjs/intl-analyzer/xliff';

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

/** Extracts every owned source message as targetless, generic XLIFF 2.1 input. */
export function exportXliff21SourceCatalog(
	descriptors: readonly IntlRuntimeDescriptorV1[],
	options: XliffSourceCatalogOptions
): string {
	const relevant = uniqueTranslationDescriptors(descriptors, options.owner);
	return xliffDocument(
		options.owner,
		undefined,
		sourceLocaleFor(options.owner, descriptors),
		relevant.map((descriptor) => xliffUnit(descriptor, undefined, undefined, undefined))
	);
}

/** Serializes a validated generic catalog as translator-facing XLIFF 2.1. */
export function exportXliff21Catalog(
	catalogInput: unknown,
	descriptors: readonly IntlRuntimeDescriptorV1[]
): string {
	const catalog = validateIntlCatalog(catalogInput, descriptors);
	const relevant = uniqueTranslationDescriptors(descriptors, catalog.owner).filter(
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

/** Imports XLIFF targets after proving that every source unit matches its current generic contract. */
export function importXliff21Catalog(
	input: string,
	descriptors: readonly IntlRuntimeDescriptorV1[]
): IntlCatalogV1 {
	const document = parseXml(input);
	requireXliffDocument(document);
	const locale = requiredAttribute(document, 'trgLang');
	const sourceLocale = requiredAttribute(document, 'srcLang');
	const file = requiredChild(document, 'file');
	const owner = xliffFileOwner(file);
	const contracts = descriptorMap(descriptors, owner);
	if (sourceLocale !== sourceLocaleFor(owner, descriptors))
		throw new TypeError(
			`XLIFF source locale does not match ${sourceLocaleFor(owner, descriptors)}`
		);
	const messages: Record<string, IntlTranslationPatternV1> = Object.create(null) as Record<
		string,
		IntlTranslationPatternV1
	>;
	const seen = new Set<string>();
	for (const unit of childElements(file, 'unit')) {
		const authoredKey = requiredAttribute(unit, 'id');
		if (seen.has(authoredKey)) throw new TypeError(`XLIFF contains duplicate unit ${authoredKey}`);
		seen.add(authoredKey);
		const descriptor = contracts.get(authoredKey);
		if (!descriptor) throw new TypeError(`XLIFF contains obsolete message ${owner}:${authoredKey}`);
		const segment = requiredChild(unit, 'segment');
		validateSourcePattern(requiredChild(segment, 'source'), descriptor);
		const target = childElement(segment, 'target');
		if (!target || target.children.length === 0) continue;
		messages[descriptor.key] = decodePattern(target.children, descriptor);
	}
	return validateIntlCatalog({ protocol: 1, locale, owner, messages }, descriptors);
}

/** Reconciles current source contracts while preserving only compatible active targets and notes. */
export function synchronizeXliff21Catalog(
	input: string | undefined,
	descriptors: readonly IntlRuntimeDescriptorV1[],
	options: XliffCatalogSynchronizationOptions
): string {
	const relevant = uniqueTranslationDescriptors(descriptors, options.owner);
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
		for (const unit of childElements(file, 'unit')) {
			const key = requiredAttribute(unit, 'id');
			if (existingUnits.has(key)) throw new TypeError(`XLIFF contains duplicate unit ${key}`);
			existingUnits.set(key, unit);
		}
	const units = relevant.map((descriptor) => {
		const previous = existingUnits.get(descriptor.key);
		const previousSegment = previous && childElement(previous, 'segment');
		if (previousSegment)
			validateSourcePattern(requiredChild(previousSegment, 'source'), descriptor);
		const target = previousSegment && childElement(previousSegment, 'target');
		const translation = target?.children.length
			? decodePattern(target.children, descriptor)
			: undefined;
		const notes = previous && childElement(previous, 'notes');
		return xliffUnit(
			descriptor,
			translation,
			notes ? serializeElement(notes) : undefined,
			previousSegment?.attributes.state
		);
	});
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
	target: IntlTranslationPatternV1 | undefined,
	notes: string | undefined,
	state: string | undefined
): string {
	const projection = projectIntlTranslationContract(descriptor.bindings, descriptor.source);
	const guide = new Map(
		projection.placeholders.map((placeholder) => [placeholder.id, placeholder])
	);
	const sourceMarkup = encodePattern(projection.source, guide);
	const targetMarkup = target && encodePattern(target, guide);
	return `<unit id="${escapeXml(descriptor.key)}">
${notes ? indent(notes, 2) + '\n' : ''}  <segment${state ? ` state="${escapeXml(state)}"` : ''}>
    <source>${sourceMarkup}</source>
${targetMarkup === undefined ? '' : `    <target>${targetMarkup}</target>\n`}  </segment>
</unit>`;
}

function encodePattern(
	pattern: IntlTranslationPatternV1,
	guide: ReadonlyMap<string, IntlTranslationPlaceholderV1>
): string {
	return pattern.map((node) => encodeNode(node, guide)).join('');
}

function encodeNode(
	node: IntlTranslationPatternNodeV1,
	guide: ReadonlyMap<string, IntlTranslationPlaceholderV1>
): string {
	if (node.kind === 'text') return escapeXml(node.value);
	const placeholder = guide.get(node.id);
	if (!placeholder)
		throw new TypeError(`Intl translation references unknown placeholder ${node.id}`);
	const constraints = ` canCopy="${placeholder.canCopy ? 'yes' : 'no'}" canDelete="${placeholder.canDelete ? 'yes' : 'no'}"`;
	if (node.kind === 'placeholder')
		return `<ph id="${escapeXml(node.id)}" equiv="{${escapeXml(placeholder.name)}}"${constraints}/>`;
	if (node.kind === 'element')
		return `<pc id="${escapeXml(node.id)}" equivStart="&lt;${escapeXml(placeholder.name)}&gt;" equivEnd="&lt;/${escapeXml(placeholder.name)}&gt;"${constraints}>${encodePattern(node.value, guide)}</pc>`;
	return `<pc id="${escapeXml(node.id)}" equivStart="{${escapeXml(placeholder.name)}}" equivEnd="{/}"${constraints}>${node.cases.map((candidate, index) => `<mrk id="${escapeXml(`${node.id}.case.${index}`)}" type="generic" value="${escapeXml(candidate.key)}">${encodePattern(candidate.value, guide)}</mrk>`).join('')}<mrk id="${escapeXml(`${node.id}.fallback`)}" type="generic">${encodePattern(node.fallback, guide)}</mrk></pc>`;
}

function decodePattern(
	children: readonly (XmlElement | string)[],
	descriptor: IntlRuntimeDescriptorV1
): IntlTranslationPatternV1 {
	const projection = projectIntlTranslationContract(descriptor.bindings, descriptor.source);
	const expected = translationNodeMap(projection.source);
	const decode = (values: readonly (XmlElement | string)[]): IntlTranslationPatternV1 =>
		Object.freeze(
			values.flatMap((child): IntlTranslationPatternNodeV1[] => {
				if (typeof child === 'string') return child ? [{ kind: 'text', value: child }] : [];
				const name = localName(child.name);
				const id = requiredAttribute(child, 'id');
				const contract = expected.get(id);
				if (!contract) throw new TypeError(`XLIFF references unknown placeholder ${id}`);
				if (name === 'ph') {
					if (contract.kind !== 'placeholder')
						throw new TypeError(`XLIFF placeholder ${id} has an incompatible structure`);
					return [{ kind: 'placeholder', id }];
				}
				if (name !== 'pc') throw new TypeError(`Unsupported XLIFF inline code ${child.name}`);
				if (contract.kind === 'element')
					return [{ kind: 'element', id, value: decode(child.children) }];
				if (contract.kind !== 'select')
					throw new TypeError(`XLIFF container ${id} has an incompatible structure`);
				const cases: { key: string; value: IntlTranslationPatternV1 }[] = [];
				let fallback: IntlTranslationPatternV1 | undefined;
				for (const branch of child.children) {
					if (typeof branch === 'string') {
						if (branch.trim())
							throw new TypeError('XLIFF select containers may contain only markers');
						continue;
					}
					if (localName(branch.name) !== 'mrk')
						throw new TypeError('XLIFF select branches must use mrk');
					const branchId = requiredAttribute(branch, 'id');
					if (branchId === `${id}.fallback`) {
						if (fallback) throw new TypeError(`XLIFF selector ${id} repeats its fallback`);
						fallback = decode(branch.children);
					} else {
						const key = requiredAttribute(branch, 'value');
						if (cases.some((candidate) => candidate.key === key))
							throw new TypeError(`XLIFF selector ${id} repeats case ${key}`);
						cases.push({ key, value: decode(branch.children) });
					}
				}
				if (!fallback) throw new TypeError(`XLIFF selector ${id} requires one fallback`);
				return [{ kind: 'select', id, cases: Object.freeze(cases), fallback }];
			})
		);
	return decode(children);
}

function validateSourcePattern(source: XmlElement, descriptor: IntlRuntimeDescriptorV1): void {
	const actual = decodePattern(source.children, descriptor);
	const expected = projectIntlTranslationContract(descriptor.bindings, descriptor.source).source;
	if (JSON.stringify(actual) !== JSON.stringify(expected))
		throw new TypeError(`XLIFF source for ${descriptor.key} does not match its current contract`);
}

function translationNodeMap(
	pattern: IntlTranslationPatternV1
): ReadonlyMap<string, IntlTranslationPatternNodeV1> {
	const result = new Map<string, IntlTranslationPatternNodeV1>();
	const visit = (nodes: IntlTranslationPatternV1): void => {
		for (const node of nodes) {
			if (node.kind === 'text') continue;
			if (result.has(node.id))
				throw new TypeError(`Intl translation repeats placeholder ${node.id}`);
			result.set(node.id, node);
			if (node.kind === 'element') visit(node.value);
			if (node.kind === 'select') {
				for (const candidate of node.cases) visit(candidate.value);
				visit(node.fallback);
			}
		}
	};
	visit(pattern);
	return result;
}

function descriptorMap(
	descriptors: readonly IntlRuntimeDescriptorV1[],
	owner: string
): ReadonlyMap<string, IntlRuntimeDescriptorV1> {
	const result = new Map<string, IntlRuntimeDescriptorV1>();
	for (const descriptor of uniqueTranslationDescriptors(descriptors, owner))
		result.set(descriptor.key, descriptor);
	return result;
}

function uniqueTranslationDescriptors(
	descriptors: readonly IntlRuntimeDescriptorV1[],
	owner: string
): IntlRuntimeDescriptorV1[] {
	const unique = new Map<string, IntlRuntimeDescriptorV1>();
	for (const descriptor of translatorVisibleDescriptors(descriptors, owner)) {
		const previous = unique.get(descriptor.key);
		if (previous) {
			const left = projectIntlTranslationContract(previous.bindings, previous.source);
			const right = projectIntlTranslationContract(descriptor.bindings, descriptor.source);
			if (JSON.stringify(left) !== JSON.stringify(right))
				throw new TypeError(
					`Intl translation key ${owner}:${descriptor.key} has conflicting contracts`
				);
			continue;
		}
		unique.set(descriptor.key, descriptor);
	}
	return [...unique.values()];
}

function requireXliffDocument(document: XmlElement): void {
	if (
		localName(document.name) !== 'xliff' ||
		document.attributes.xmlns !== xliffNamespace ||
		document.attributes.version !== '2.1'
	)
		throw new TypeError('XLIFF interchange must be an XLIFF 2.1 document');
	rejectExactRuntimeMetadata(document);
}

function rejectExactRuntimeMetadata(element: XmlElement): void {
	for (const [name, value] of Object.entries(element.attributes))
		if (
			name === 'xmlns:exact' ||
			name.startsWith('exact:') ||
			value.startsWith('exact:') ||
			value.startsWith('x-exact-')
		)
			throw new TypeError('XLIFF contains unsupported eXact runtime metadata');
	for (const child of element.children)
		if (typeof child !== 'string') rejectExactRuntimeMetadata(child);
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
