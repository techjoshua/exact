import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exact } from '@exactjs/vite-plugin';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = join(root, '.standalone-build');
const outputRoot = join(root, 'dist');
const outputPath = join(outputRoot, 'puzzle-foundry.html');

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
				codeSplitting: false,
				entryFileNames: 'assets/app.js',
				assetFileNames: 'assets/[name][extname]'
			}
		}
	}
});

const builtHtml = await readFile(join(buildRoot, 'index.html'), 'utf8');
const assets = await readdir(join(buildRoot, 'assets'));
const scripts = assets.filter((name) => name.endsWith('.js'));
const stylesheets = assets.filter((name) => name.endsWith('.css'));
if (scripts.length !== 1)
	throw new Error(`Expected one JavaScript bundle, found ${scripts.length}.`);

const script = (await readFile(join(buildRoot, 'assets', scripts[0]), 'utf8')).replace(
	/<\/script/gi,
	'<\\/script'
);
const styles = (
	await Promise.all(stylesheets.map((name) => readFile(join(buildRoot, 'assets', name), 'utf8')))
)
	.join('\n')
	.replace(/<\/style/gi, '<\\/style');
const html = builtHtml
	.replace(
		/<script[^>]*\bsrc=["'][^"']+["'][^>]*><\/script>/gi,
		`<script type="module">${script}</script>`
	)
	.replace(/<link[^>]*\brel=["']stylesheet["'][^>]*>/gi, `<style>${styles}</style>`);

if (/<script[^>]+\bsrc=/i.test(html) || /<link[^>]+\brel=["']stylesheet["']/i.test(html))
	throw new Error('The standalone build still contains an external script or stylesheet.');

await mkdir(outputRoot, { recursive: true });
await writeFile(outputPath, html);
await rm(buildRoot, { recursive: true, force: true });
const outputFiles = await readdir(outputRoot);
if (outputFiles.length !== 1 || outputFiles[0] !== 'puzzle-foundry.html')
	throw new Error(`Expected exactly one standalone HTML file, found: ${outputFiles.join(', ')}`);

console.log(`Built standalone Puzzle Foundry: ${outputPath} (${html.length} bytes)`);
