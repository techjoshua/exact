import {
	canonicalizeIntlValue,
	projectIntlTranslationContract,
	type IntlRuntimeDescriptorV1,
	type IntlTranslationPatternV1
} from '@exactjs/intl';
import { createHash } from 'node:crypto';
import {
	childElement,
	childElements,
	requiredAttribute,
	type XmlElement
} from '@exactjs/intl-analyzer/xliff';

/** Maps legacy runtime-metadata code IDs to the current generic placeholder IDs. */
export function legacyPlaceholderAliases(
	unit: XmlElement,
	descriptor: IntlRuntimeDescriptorV1
): ReadonlyMap<string, string> | undefined {
	const container = childElement(unit, 'originalData');
	if (!container) return undefined;
	const data = new Map<string, string>();
	for (const entry of childElements(container, 'data')) {
		const id = requiredAttribute(entry, 'id');
		if (data.has(id)) throw new TypeError(`XLIFF original data repeats ${id}`);
		if (entry.children.some((child) => typeof child !== 'string'))
			throw new TypeError('XLIFF original data must contain text');
		data.set(id, entry.children.join(''));
	}
	const exactByIdentity = new Map<string, string>();
	const projection = projectIntlTranslationContract(descriptor.bindings, descriptor.source);
	const index = (
		generic: IntlTranslationPatternV1,
		exact: IntlRuntimeDescriptorV1['source']
	): void => {
		for (let position = 0; position < generic.length; position++) {
			const genericNode = generic[position]!;
			const exactNode = exact[position]!;
			if (genericNode.kind === 'text' || exactNode.kind === 'text') continue;
			exactByIdentity.set(legacyMetadataIdentity(exactNode), genericNode.id);
			if (genericNode.kind === 'element' && exactNode.kind === 'element')
				index(genericNode.value, exactNode.value);
			if (genericNode.kind === 'select' && exactNode.kind === 'select') {
				for (let branch = 0; branch < genericNode.cases.length; branch++)
					index(genericNode.cases[branch]!.value, exactNode.cases[branch]!.value);
				index(genericNode.fallback, exactNode.fallback);
			}
		}
	};
	index(projection.source, descriptor.source);
	const aliases = new Map<string, string>();
	const visit = (element: XmlElement): void => {
		const reference = element.attributes.dataRef ?? element.attributes.dataRefStart;
		if (reference) {
			const metadata = data.get(reference);
			if (!metadata) throw new TypeError(`XLIFF references missing original data ${reference}`);
			const replacement = exactByIdentity.get(canonicalMetadata(metadata));
			if (replacement && element.attributes.id) aliases.set(element.attributes.id, replacement);
		}
		for (const child of element.children) if (typeof child !== 'string') visit(child);
	};
	visit(unit);
	return aliases;
}

/** Recreates protocol-1 catalog keys solely to migrate already-authored legacy XLIFF. */
export function legacyMessageKey(descriptor: IntlRuntimeDescriptorV1): string {
	const canonical = canonicalizeIntlValue({
		protocol: 1,
		sourceLocale: descriptor.sourceLocale,
		target: descriptor.target,
		...(descriptor.name ? { context: descriptor.name } : {}),
		bindings: descriptor.bindings.map(({ index: _index, ...binding }) => binding),
		source: descriptor.source
	});
	return `m1_${createHash('sha256').update(canonical.normalize('NFC'), 'utf8').digest('base64url')}`;
}

function legacyMetadataIdentity(
	node: Exclude<IntlRuntimeDescriptorV1['source'][number], { kind: 'text' }>
): string {
	if (node.kind === 'element') return JSON.stringify({ kind: node.kind, binding: node.binding });
	if (node.kind === 'select')
		return JSON.stringify({
			kind: node.kind,
			binding: node.binding,
			...(node.rangeBinding === undefined ? {} : { rangeBinding: node.rangeBinding }),
			selection: node.selection
		});
	return JSON.stringify(node);
}

function canonicalMetadata(input: string): string {
	return JSON.stringify(JSON.parse(input) as unknown);
}
