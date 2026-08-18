import { copyFile, cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const docsRoot = resolve(root, 'apps/docs/dist');
const sudokuRoot = resolve(root, 'apps/sudoku/dist');
const puzzleFoundryRoot = resolve(root, 'apps/puzzle-generator/dist');
const hostedApplications = new Map([
	['enhancements', resolve(root, 'apps/enhancement-playground/dist')],
	['intl', resolve(root, 'apps/intl-testbed/dist')],
	['kanban', resolve(root, 'apps/kanban/dist')],
	['workbench', resolve(root, 'apps/workbench/dist')]
]);
const outputRoot = resolve(root, '.tmp/gh-pages');
const sudokuFiles = [
	'manifest.webmanifest',
	'service-worker.js',
	'sudoku-icon-192.png',
	'sudoku-icon-512.png',
	'sudoku-icon.svg',
	'sudoku.html'
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await copyFile(resolve(docsRoot, 'index.html'), resolve(outputRoot, 'index.html'));
for (const file of sudokuFiles) {
	await copyFile(resolve(sudokuRoot, file), resolve(outputRoot, file));
}
await copyFile(
	resolve(puzzleFoundryRoot, 'puzzle-foundry.html'),
	resolve(outputRoot, 'puzzle-foundry.html')
);
for (const [directory, source] of hostedApplications) {
	await cp(source, resolve(outputRoot, directory), { recursive: true });
}

const htmlFiles = ['index.html', 'puzzle-foundry.html', 'sudoku.html'];
for (const file of htmlFiles) {
	const html = await readFile(resolve(outputRoot, file), 'utf8');
	if (/<script[^>]+\bsrc=/i.test(html) || /<link[^>]+\brel=["']stylesheet["']/i.test(html)) {
		throw new Error(`${file} is not a self-contained HTML application.`);
	}
}

const expectedFiles = [
	'enhancements',
	'index.html',
	'intl',
	'kanban',
	'puzzle-foundry.html',
	...sudokuFiles,
	'workbench'
].sort();
const outputFiles = (await readdir(outputRoot)).sort();
if (JSON.stringify(outputFiles) !== JSON.stringify(expectedFiles)) {
	throw new Error(`Unexpected GitHub Pages files: ${outputFiles.join(', ')}`);
}

console.log(`Prepared ${outputFiles.length} GitHub Pages files in ${outputRoot}`);
