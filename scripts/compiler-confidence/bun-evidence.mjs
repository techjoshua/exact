import path from 'node:path';

/** Reads only Bun's successful JUnit grammar and normalizes it for the named-witness validator. */
export function readBunExecution(xml, cwd) {
	const assertions = [];
	const stack = [];
	let expected;
	let rootClosed = false;
	const body = xml.replace(/^\s*<\?xml[^?]*\?>/, '');
	for (const token of body.split(/(<[^>]+>)/)) {
		if (!token.trim()) continue;
		const tag = /^<(\/)?(testsuites|testsuite|testcase|properties|property)([^<>]*?)(\/?)>$/.exec(
			token
		);
		if (!tag || rootClosed) throw new Error('Invalid Bun JUnit structure');
		const [, closing, name, attributes, selfClosing] = tag;
		if (closing) {
			if (attributes.trim() || selfClosing || stack.pop() !== name)
				throw new Error('Invalid Bun JUnit closing tag');
			if (!stack.length) rootClosed = true;
			continue;
		}
		const values = readAttributes(attributes);
		// Bun adds CI provenance to suites. Metadata cannot substitute for test executions.
		if (name === 'properties') {
			if (stack.at(-1) !== 'testsuite' || attributes.trim() || selfClosing)
				throw new Error('Invalid Bun JUnit properties');
			stack.push(name);
			continue;
		}
		if (name === 'property') {
			if (
				stack.at(-1) !== 'properties' ||
				!selfClosing ||
				!values.name ||
				values.value === undefined
			)
				throw new Error('Invalid Bun JUnit property');
			continue;
		}
		for (const key of ['failures', 'errors', 'skipped', 'disabled'])
			if (values[key] !== undefined && values[key] !== '0')
				throw new Error('Bun execution contains unsuccessful tests');
		if (name === 'testsuites') {
			if (expected !== undefined || stack.length || selfClosing)
				throw new Error('Invalid Bun JUnit root');
			expected = Number(values.tests);
			if (!Number.isSafeInteger(expected) || expected <= 0)
				throw new Error('Missing Bun executions');
		} else if (
			!['testsuites', 'testsuite'].includes(stack.at(-1)) ||
			(name === 'testcase' && stack.at(-1) !== 'testsuite')
		)
			throw new Error('Invalid Bun JUnit parent');
		if (name === 'testcase') {
			if (!selfClosing || !values.file || !values.name)
				throw new Error('Missing or unsuccessful Bun assertion');
			assertions.push({
				file: path.resolve(cwd, values.file),
				title: values.name,
				status: 'passed'
			});
		} else {
			if (selfClosing) throw new Error('Empty Bun suite');
			stack.push(name);
		}
	}
	if (!rootClosed || stack.length || assertions.length !== expected)
		throw new Error('Incomplete Bun execution');
	const files = new Map();
	for (const { file, ...assertion } of assertions) {
		if (!files.has(file)) files.set(file, []);
		files.get(file).push(assertion);
	}
	return {
		success: true,
		testResults: [...files].map(([name, assertionResults]) => ({ name, assertionResults }))
	};
}

/** Accepts quoted report attributes without external entities, duplicate keys or partial parsing. */
function readAttributes(source) {
	const values = Object.create(null);
	const attribute = /\s+([\w:-]+)="([^"<>]*)"/y;
	let position = 0;
	while (source.slice(position).trim()) {
		attribute.lastIndex = position;
		const match = attribute.exec(source);
		if (!match || Object.hasOwn(values, match[1])) throw new Error('Invalid Bun JUnit attributes');
		values[match[1]] = match[2].replace(/&([^;]*);/g, (_, entity) => {
			const known = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
			if (Object.hasOwn(known, entity)) return known[entity];
			if (/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity))
				return String.fromCodePoint(
					entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
				);
			throw new Error('Unknown Bun JUnit entity');
		});
		position = attribute.lastIndex;
	}
	return values;
}
