import type { IntlCatalogIssue, IntlLanguageDescriptor } from './analysis-contracts.js';
import { canonicalIntlLocale, intlLocalesAgree } from './assistance.js';

/** Bounded XML shape supplied by the build-owned XLIFF parser. */
export type IntlLanguageXmlElement = Readonly<{
	name: string;
	attributes: Readonly<Record<string, string>>;
	children: readonly (IntlLanguageXmlElement | string)[];
}>;

/** Adds locale coverage from a validated protocol-JSON catalog container. */
export function inspectIntlJsonCatalog(
	value: unknown,
	target: Map<string, Set<string>>,
	issues: IntlCatalogIssue[]
): void {
	for (const catalog of Array.isArray(value) ? value : [value]) {
		if (!isRecord(catalog) || typeof catalog.locale !== 'string' || !isRecord(catalog.messages)) {
			issues.push({ code: 'invalid-catalog', summary: 'Intl JSON catalog has an invalid shape.' });
			continue;
		}
		for (const key of Object.keys(catalog.messages)) addCoverage(target, key, catalog.locale);
	}
}

/** Validates XLIFF structure and adds translated locale coverage. */
export function inspectIntlXliffCatalog(
	root: IntlLanguageXmlElement,
	descriptors: readonly IntlLanguageDescriptor[],
	target: Map<string, Set<string>>,
	sourceKeys: Set<string>,
	issues: IntlCatalogIssue[]
): void {
	if (xmlLocalName(root.name) !== 'xliff' || root.attributes.version !== '2.1')
		throw new TypeError('Intl catalogs must be XLIFF 2.1 documents');
	const sourceLocale = root.attributes.srcLang;
	const targetLocale = root.attributes.trgLang;
	if (!sourceLocale) throw new TypeError('XLIFF requires srcLang');
	const expectedLocales = new Set(descriptors.map((descriptor) => descriptor.sourceLocale));
	if (
		expectedLocales.size &&
		![...expectedLocales].some((locale) => intlLocalesAgree(locale, sourceLocale))
	)
		issues.push({
			code: 'catalog-locale-mismatch',
			summary: `Catalog srcLang ${sourceLocale} does not match this project source locale.`
		});
	const seen = new Set<string>();
	for (const unit of xmlDescendants(root, 'unit')) {
		const key = unit.attributes.id;
		if (!key) throw new TypeError('XLIFF unit requires id');
		if (seen.has(key))
			issues.push({ code: 'invalid-catalog', key, summary: `Catalog repeats unit ${key}.` });
		seen.add(key);
		if (/obsolete/iu.test(unit.attributes.type ?? '') || unit.attributes.translate === 'no')
			issues.push({
				code: 'obsolete-translation',
				key,
				summary: `Catalog retains obsolete unit ${key}.`
			});
		if (hasExactMetadata(unit))
			issues.push({
				code: 'catalog-exact-metadata',
				key,
				summary: `Catalog unit ${key} contains legacy eXact runtime metadata; regenerate it.`
			});
		const segment = xmlDescendants(unit, 'segment')[0];
		const source = segment && xmlChildren(segment, 'source')[0];
		const translated = segment && xmlChildren(segment, 'target')[0];
		if (!source) throw new TypeError(`XLIFF unit ${key} requires a source`);
		if (!targetLocale) sourceKeys.add(key);
		if (
			targetLocale &&
			translated &&
			xmlText(translated).trim().length + inlineCodes(translated).size
		)
			addCoverage(target, key, targetLocale);
		if (translated) validateInlineCodes(key, source, translated, issues);
	}
}

/** Produces a stable message for caught catalog parsing and filesystem failures. */
export function intlCatalogErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function addCoverage(target: Map<string, Set<string>>, key: string, locale: string): void {
	let locales = target.get(key);
	if (!locales) target.set(key, (locales = new Set()));
	locales.add(canonicalIntlLocale(locale));
}

function validateInlineCodes(
	key: string,
	source: IntlLanguageXmlElement,
	target: IntlLanguageXmlElement,
	issues: IntlCatalogIssue[]
): void {
	const expected = inlineCodes(source);
	const actual = inlineCodes(target);
	for (const [id, declaration] of expected) {
		const count = actual.get(id)?.count ?? 0;
		if (count > 1 && declaration.canCopy === 'no')
			issues.push({
				code: 'incompatible-translation',
				key,
				summary: `Translation ${key} duplicates non-copyable placeholder ${id}.`
			});
		if (count && actual.get(id)?.kind !== declaration.kind)
			issues.push({
				code: 'incompatible-translation',
				key,
				summary: `Translation ${key} changes the structure of placeholder ${id}.`
			});
	}
	for (const id of actual.keys())
		if (!expected.has(id))
			issues.push({
				code: 'incompatible-translation',
				key,
				summary: `Translation ${key} introduces unknown placeholder ${id}.`
			});
}

function inlineCodes(
	element: IntlLanguageXmlElement
): Map<string, { kind: string; count: number; canCopy?: string }> {
	const result = new Map<string, { kind: string; count: number; canCopy?: string }>();
	const visit = (node: IntlLanguageXmlElement): void => {
		const kind = xmlLocalName(node.name);
		if ((kind === 'ph' || kind === 'pc') && node.attributes.id) {
			const current = result.get(node.attributes.id);
			result.set(node.attributes.id, {
				kind,
				count: (current?.count ?? 0) + 1,
				canCopy: node.attributes.canCopy ?? current?.canCopy
			});
		}
		for (const child of node.children) if (typeof child !== 'string') visit(child);
	};
	visit(element);
	return result;
}

function xmlDescendants(element: IntlLanguageXmlElement, name: string): IntlLanguageXmlElement[] {
	const result: IntlLanguageXmlElement[] = [];
	for (const child of element.children)
		if (typeof child !== 'string') {
			if (xmlLocalName(child.name) === name) result.push(child);
			result.push(...xmlDescendants(child, name));
		}
	return result;
}

function xmlChildren(element: IntlLanguageXmlElement, name: string): IntlLanguageXmlElement[] {
	return element.children.filter(
		(child): child is IntlLanguageXmlElement =>
			typeof child !== 'string' && xmlLocalName(child.name) === name
	);
}

function xmlLocalName(name: string): string {
	return name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
}

function xmlText(element: IntlLanguageXmlElement): string {
	return element.children
		.map((child) => (typeof child === 'string' ? child : xmlText(child)))
		.join('');
}

function hasExactMetadata(element: IntlLanguageXmlElement): boolean {
	if (xmlLocalName(element.name) === 'originalData') return true;
	if (
		Object.entries(element.attributes).some(
			([name, value]) => name.startsWith('exact:') || /(?:^|:)exact(?::|$)/iu.test(value)
		)
	)
		return true;
	return element.children.some((child) => typeof child !== 'string' && hasExactMetadata(child));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
