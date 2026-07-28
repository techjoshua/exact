import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exact } from '@exactjs/vite-plugin';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = join(root, '.standalone-build');
const outputRoot = join(root, 'dist');
const outputFileName = 'sudoku.html';
const outputPath = join(outputRoot, outputFileName);

await rm(buildRoot, { recursive: true, force: true });
await rm(outputRoot, { recursive: true, force: true });

await build({
	root,
	base: './',
	configFile: false,
	plugins: [exact()],
	build: {
		outDir: buildRoot,
		emptyOutDir: true,
		cssCodeSplit: false,
		rollupOptions: {
			input: join(root, 'index.html'),
			output: {
				entryFileNames: 'assets/app.js',
				assetFileNames: 'assets/[name][extname]'
			}
		}
	}
});

const builtHtml = await readFile(join(buildRoot, 'index.html'), 'utf8');
const assets = await readdir(join(buildRoot, 'assets'));
const scriptNames = assets.filter((name) => name.endsWith('.js'));
const styleNames = assets.filter((name) => name.endsWith('.css'));

if (scriptNames.length !== 1) {
	throw new Error(`Expected one JavaScript bundle, found ${scriptNames.length}.`);
}

const script = (await readFile(join(buildRoot, 'assets', scriptNames[0]), 'utf8')).replace(
	/<\/script/gi,
	'<\\/script'
);
const styles = (
	await Promise.all(styleNames.map((name) => readFile(join(buildRoot, 'assets', name), 'utf8')))
)
	.join('\n')
	.replace(/<\/style/gi, '<\\/style');

const documentHtml = builtHtml
	.replace(
		/<script[^>]*\bsrc=["'][^"']+["'][^>]*><\/script>/gi,
		`<script type="module">${script}</script>`
	)
	.replace(/<link[^>]*\brel=["']stylesheet["'][^>]*>/gi, `<style>${styles}</style>`);

if (
	/<script[^>]+\bsrc=/i.test(documentHtml) ||
	/<link[^>]+\brel=["']stylesheet["']/i.test(documentHtml)
) {
	throw new Error('The standalone build still contains an external script or stylesheet.');
}

await mkdir(outputRoot, { recursive: true });
await writeFile(outputPath, documentHtml);

const manifest = JSON.parse(await readFile(join(buildRoot, 'manifest.webmanifest'), 'utf8'));
manifest.start_url = `./${outputFileName}`;
await writeFile(
	join(outputRoot, 'manifest.webmanifest'),
	`${JSON.stringify(manifest, null, '\t')}\n`
);

const serviceWorker = (await readFile(join(buildRoot, 'service-worker.js'), 'utf8'))
	.replace("const entryFile = './index.html';", `const entryFile = './${outputFileName}';`)
	.replace("const startFile = './';", `const startFile = './${outputFileName}';`);
await writeFile(join(outputRoot, 'service-worker.js'), serviceWorker);
await copyFile(join(buildRoot, 'sudoku-icon.svg'), join(outputRoot, 'sudoku-icon.svg'));
await copyFile(join(buildRoot, 'sudoku-icon-192.png'), join(outputRoot, 'sudoku-icon-192.png'));
await copyFile(join(buildRoot, 'sudoku-icon-512.png'), join(outputRoot, 'sudoku-icon-512.png'));
await rm(buildRoot, { recursive: true, force: true });

const outputFiles = (await readdir(outputRoot)).sort();
const expectedFiles = [
	'manifest.webmanifest',
	'service-worker.js',
	'sudoku-icon-192.png',
	'sudoku-icon-512.png',
	'sudoku-icon.svg',
	outputFileName
].sort();
if (JSON.stringify(outputFiles) !== JSON.stringify(expectedFiles)) {
	throw new Error(`Unexpected GitHub Pages files: ${outputFiles.join(', ')}`);
}

console.log(`Built standalone Sudoku: ${outputPath} (${documentHtml.length} bytes)`);
