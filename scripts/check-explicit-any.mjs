import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = process.cwd();
const maintainedRoots = [
	'apps',
	'component-libraries',
	'framework-adapters',
	'framework-comparison',
	'packages',
	'plugins',
	'react-adapters'
];
const ignoredDirectories = new Set([
	'.exact',
	'.tmp',
	'coverage',
	'dist',
	'fixtures',
	'generated',
	'node_modules',
	'reference'
]);
const baseline = 73;
let total = 0;
const counts = [];

for (const maintainedRoot of maintainedRoots) {
	for (const file of await sourceFiles(path.join(root, maintainedRoot))) {
		if (/(?:^|\/)(?:test-support|test-fixtures)(?:\/|$)/.test(repositoryPath(file))) continue;
		if (/\.(?:test|spec)\.tsx?$/.test(file)) continue;
		const count = explicitAnyCount(await readFile(file, 'utf8'), file.endsWith('x'));
		if (!count) continue;
		total += count;
		counts.push([repositoryPath(file), count]);
	}
}

if (total > baseline) {
	const largest = counts
		.sort((left, right) => right[1] - left[1])
		.slice(0, 20)
		.map(([file, count]) => `${file}: ${count}`)
		.join('\n');
	throw new Error(
		`Production explicit-any count increased from ${baseline} to ${total}. ` +
			`Use generics or unknown with validation, or lower the baseline after removing existing erasure.\n${largest}`
	);
}

console.log(`explicit-any ratchet ok: ${total}/${baseline}`);

function explicitAnyCount(source, jsx) {
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		false,
		jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
		source
	);
	let count = 0;
	while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken)
		if (scanner.getToken() === ts.SyntaxKind.AnyKeyword) count++;
	return count;
}

async function sourceFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (ignoredDirectories.has(entry.name)) continue;
		const target = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await sourceFiles(target)));
		else if (/\.tsx?$/.test(entry.name)) files.push(target);
	}
	return files;
}

function repositoryPath(file) {
	return path.relative(root, file).replaceAll('\\', '/');
}
