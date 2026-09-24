import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

/** Validates the application's shared navigation, search, and route inventory without built packages. */
export function validateDocNavigation(groups, keys) {
	const paths = new Set();
	const used = new Set();
	for (const group of groups) {
		if (!group.label?.trim() || !group.pages?.length)
			throw new Error('Documentation groups need a label and pages');
		for (const page of group.pages) {
			if (!/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(page.path) || paths.has(page.path))
				throw new Error(`Invalid or duplicate documentation path: ${page.path}`);
			if (!page.label?.trim() || !page.summary?.trim() || !page.keywords?.trim())
				throw new Error(`Missing navigation/search metadata: ${page.path}`);
			if (!keys.has(page.component))
				throw new Error(`Unregistered documentation page: ${page.component}`);
			paths.add(page.path);
			used.add(page.component);
		}
	}
	for (const key of keys)
		if (!used.has(key)) throw new Error(`Documentation page is absent from navigation: ${key}`);
}

/** Reads the source-owned registry and metadata, retaining compiler type checking as an independent guard. */
export async function checkDocNavigation() {
	const source = await readFile(new URL('../src/docs-manifest.tsx', import.meta.url), 'utf8');
	const code = stripTypeScriptTypes(source);
	const { docGroups } = await import(
		`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
	);
	const registry = await readFile(new URL('../src/DocsPageRoute.tsx', import.meta.url), 'utf8');
	const start = registry.indexOf('const DocsPages = createComponentRegistry(');
	const end = registry.indexOf('\n}));', start);
	if (start < 0 || end < 0)
		throw new Error('Update navigation validation for the changed DocsPages registry shape');
	const entries = registry.slice(start, end);
	const keys = new Set(
		[...entries.matchAll(/^\t([A-Za-z][\w]*)(?::|,)/gm)].map((match) => match[1])
	);
	if (!keys.size) throw new Error('Documentation registry is empty');
	validateDocNavigation(docGroups, keys);
}
