import { readFile } from 'node:fs/promises';

const executableEntries = [
	'page-bridge.js',
	'content-script.js',
	'background.js',
	'devtools.js',
	'panel.js'
];

const bareModuleSpecifier =
	/\b(?:from\s*|import\s*(?:\(\s*)?)['"](?![./]|(?:chrome|data|https?):)[^'"]+['"]/;

for (const filename of executableEntries) {
	const output = await readFile(new URL(`./dist/${filename}`, import.meta.url), 'utf8');
	if (bareModuleSpecifier.test(output)) {
		throw new Error(`${filename} contains a bare module specifier that Chromium cannot resolve`);
	}
}

console.log('Chromium DevTools artifact contains only browser-resolvable module references.');
