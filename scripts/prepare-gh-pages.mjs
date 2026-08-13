import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const docsRoot = resolve(root, 'apps/docs/dist');
const sudokuRoot = resolve(root, 'apps/sudoku/dist');
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

const htmlFiles = ['index.html', 'sudoku.html'];
for (const file of htmlFiles) {
	const html = await readFile(resolve(outputRoot, file), 'utf8');
	if (/<script[^>]+\bsrc=/i.test(html) || /<link[^>]+\brel=["']stylesheet["']/i.test(html)) {
		throw new Error(`${file} is not a self-contained HTML application.`);
	}
}

const expectedFiles = ['index.html', ...sudokuFiles].sort();
const outputFiles = (await readdir(outputRoot)).sort();
if (JSON.stringify(outputFiles) !== JSON.stringify(expectedFiles)) {
	throw new Error(`Unexpected GitHub Pages files: ${outputFiles.join(', ')}`);
}

console.log(`Prepared ${outputFiles.length} GitHub Pages files in ${outputRoot}`);
