import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = [
	'packages',
	'framework-adapters',
	'react-adapters',
	'plugins',
	'component-libraries'
];
const allowed = new Set([
	'packages/core/src/localization/facade.ts',
	'packages/core/src/localization/formatter-pool.ts'
]);
const productionSource = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const excluded = /(?:^|\/)(?:dist|node_modules)(?:\/|$)|\.(?:test|spec)\.[^.]+$/u;
const directIntl = [
	/\bnew\s+(?:globalThis\.)?Intl\.[A-Za-z]+\s*\(/u,
	/\b(?:globalThis\.)?Intl\.(?:NumberFormat|DateTimeFormat|PluralRules|RelativeTimeFormat|DisplayNames|ListFormat|DurationFormat|Collator|Segmenter|Locale|getCanonicalLocales|supportedValuesOf)\s*\(/u,
	/\.toLocale(?:String|DateString|TimeString)\s*\(/u
];

const violations = [];
for (const sourceRoot of sourceRoots) {
	for (const filename of await files(path.join(root, sourceRoot))) {
		const relative = path.relative(root, filename).replaceAll('\\', '/');
		if (!productionSource.test(relative) || excluded.test(relative) || allowed.has(relative))
			continue;
		const source = await readFile(filename, 'utf8');
		const lines = source.split(/\r?\n/u);
		for (let index = 0; index < lines.length; index++) {
			if (directIntl.some((pattern) => pattern.test(lines[index]))) {
				violations.push(`${relative}:${index + 1}: ${lines[index].trim()}`);
			}
		}
	}
}

if (violations.length) {
	throw new Error(
		`Production Intl operations must use the @exactjs/core cache facade:\n${violations.join('\n')}`
	);
}

console.log('Intl cache boundary ok');

async function files(directory) {
	const result = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await files(filename)));
		else result.push(filename);
	}
	return result;
}
