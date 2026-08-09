import { SaxesParser } from 'saxes';

const maximumInterchangeLength = 10 * 1024 * 1024;
const maximumXmlNodes = 65_536;
const maximumXmlDepth = 64;

/** Bounded element representation retained by the XLIFF interchange parser. */
export type XmlElement = {
	readonly name: string;
	readonly attributes: Readonly<Record<string, string>>;
	readonly children: readonly (XmlElement | string)[];
};

/** Parses bounded, entity-free XML into the small tree used by XLIFF interchange. */
export function parseXml(input: string): XmlElement {
	boundedInterchange(input);
	let root: XmlElement | undefined;
	const stack: {
		name: string;
		attributes: Record<string, string>;
		children: (XmlElement | string)[];
	}[] = [];
	let nodes = 0;
	const parser = new SaxesParser({ xmlns: false });
	parser.on('doctype', () => {
		throw new TypeError('XLIFF interchange must not contain document types or entities');
	});
	parser.on('opentag', (tag) => {
		if (++nodes > maximumXmlNodes || stack.length >= maximumXmlDepth)
			throw new TypeError('XLIFF interchange exceeds XML structure limits');
		const attributes: Record<string, string> = {};
		for (const [name, value] of Object.entries(tag.attributes)) attributes[name] = String(value);
		stack.push({ name: tag.name, attributes, children: [] });
	});
	parser.on('text', (value) => {
		if (stack.length) stack.at(-1)!.children.push(value);
	});
	parser.on('cdata', () => {
		throw new TypeError('XLIFF interchange must not contain CDATA');
	});
	parser.on('closetag', () => {
		const current = stack.pop();
		if (!current) throw new TypeError('XLIFF contains an unmatched closing tag');
		const element: XmlElement = {
			name: current.name,
			attributes: current.attributes,
			children: current.children
		};
		if (stack.length) stack.at(-1)!.children.push(element);
		else if (root) throw new TypeError('XLIFF must contain one document element');
		else root = element;
	});
	parser.write(input).close();
	if (!root || stack.length) throw new TypeError('XLIFF document is incomplete');
	return root;
}

/** Returns direct children whose namespace-local element name matches `name`. */
export function childElements(element: XmlElement, name: string): XmlElement[] {
	return element.children.filter(
		(child): child is XmlElement => typeof child !== 'string' && localName(child.name) === name
	);
}

/** Returns the first matching direct child without requiring it to exist. */
export function childElement(element: XmlElement, name: string): XmlElement | undefined {
	return childElements(element, name)[0];
}

/** Returns a required direct child or reports a bounded XLIFF shape error. */
export function requiredChild(element: XmlElement, name: string): XmlElement {
	const child = childElement(element, name);
	if (!child) throw new TypeError(`XLIFF ${localName(element.name)} requires ${name}`);
	return child;
}

/** Returns a required nonempty attribute or reports its owning XLIFF element. */
export function requiredAttribute(element: XmlElement, name: string): string {
	const value = element.attributes[name];
	if (!value) throw new TypeError(`XLIFF ${localName(element.name)} requires ${name}`);
	return value;
}

/** Reads a required attribute as a nonnegative safe binding index. */
export function numericAttribute(element: XmlElement, name: string): number {
	const value = Number(requiredAttribute(element, name));
	if (!Number.isSafeInteger(value) || value < 0)
		throw new TypeError(`XLIFF ${name} must be a binding index`);
	return value;
}

/** Serializes a bounded XML element tree with all authored values escaped. */
export function serializeElement(element: XmlElement): string {
	const attributes = Object.entries(element.attributes)
		.map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
		.join('');
	return `<${element.name}${attributes}>${serializeChildren(element.children)}</${element.name}>`;
}

/** Removes formatting-only text from XLIFF structural containers before serialization. */
export function compactStructuralWhitespace(element: XmlElement): XmlElement {
	const structuralContainer = [
		'xliff',
		'file',
		'unit',
		'notes',
		'originalData',
		'segment'
	].includes(localName(element.name));
	return {
		...element,
		children: element.children
			.filter((child) => !structuralContainer || typeof child !== 'string' || /\S/u.test(child))
			.map((child) => (typeof child === 'string' ? child : compactStructuralWhitespace(child)))
	};
}

/** Removes an optional XML namespace prefix for core-element comparisons. */
export function localName(name: string): string {
	return name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
}

/** Indents every line of generated XML by a fixed number of spaces. */
export function indent(value: string, spaces: number): string {
	const prefix = ' '.repeat(spaces);
	return value
		.split('\n')
		.map((line) => `${prefix}${line}`)
		.join('\n');
}

/** Escapes text for safe use in either XML character data or quoted attributes. */
export function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function serializeChildren(children: readonly (XmlElement | string)[]): string {
	return children
		.map((child) => (typeof child === 'string' ? escapeXml(child) : serializeElement(child)))
		.join('');
}

function boundedInterchange(input: string): void {
	if (typeof input !== 'string' || input.length > maximumInterchangeLength)
		throw new TypeError(
			`Intl interchange must be a string no larger than ${maximumInterchangeLength} bytes`
		);
	if (/<!DOCTYPE|<!ENTITY/iu.test(input))
		throw new TypeError('XLIFF interchange must not contain document types or entities');
}
