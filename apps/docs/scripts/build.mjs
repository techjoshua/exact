import { build } from 'vite';
import { exact } from '@exactjs/vite-plugin';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exactPluginOptions } from '../exact-options.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = join(root, '.build');
const clientRoot = join(buildRoot, 'client');
const outputRoot = join(root, 'dist');

await rm(buildRoot, { recursive: true, force: true });
await rm(outputRoot, { recursive: true, force: true });

await build({
	root,
	base: './',
	configFile: false,
	plugins: [exact(exactPluginOptions)],
	build: {
		outDir: clientRoot,
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

const clientHtml = await readFile(join(clientRoot, 'index.html'), 'utf8');
const assets = await readdir(join(clientRoot, 'assets'));
const scriptNames = assets.filter((name) => name.endsWith('.js'));
const styleNames = assets.filter((name) => name.endsWith('.css'));
const externalAssets = assets.filter((name) => !name.endsWith('.js') && !name.endsWith('.css'));
if (scriptNames.length !== 1) {
	throw new Error(
		`Expected one standalone documentation JavaScript bundle, found ${scriptNames.length}.`
	);
}
if (externalAssets.length > 0) {
	throw new Error(
		`Standalone documentation assets must be inlined, found: ${externalAssets.join(', ')}`
	);
}

const script = (await readFile(join(clientRoot, 'assets', scriptNames[0]), 'utf8')).replace(
	/<\/script/gi,
	'<\\/script'
);
const styles = (
	await Promise.all(styleNames.map((name) => readFile(join(clientRoot, 'assets', name), 'utf8')))
).join('\n');

const head = clientHtml.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const documentHtml = `<!doctype html>
<html lang="en">
<head>${head
	.replace(/<script[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '')
	.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '')}
<style>${styles}</style>
</head>
<body>
<div id="app"></div>
<script type="module">${script}</script>
</body>
</html>`;

await mkdir(outputRoot, { recursive: true });
await writeFile(join(outputRoot, 'index.html'), documentHtml);
await rm(buildRoot, { recursive: true, force: true });

const files = await readdir(outputRoot);
if (files.length !== 1 || files[0] !== 'index.html') {
	throw new Error(`Expected one standalone index.html, found: ${files.join(', ')}`);
}
if (
	/<script[^>]+\bsrc=/i.test(documentHtml) ||
	/<link[^>]+\brel=["']stylesheet["']/i.test(documentHtml)
) {
	throw new Error('The standalone documentation still contains an external script or stylesheet.');
}
if (!documentHtml.includes('<div id="app"></div>') || documentHtml.includes('exact:component:'))
	throw new Error('The standalone documentation must start from an empty client-only root.');
if (
	!documentHtml.includes('data:image/png;base64,') ||
	!documentHtml.includes('VS Code showing eXact internationalization enhancement attributes')
) {
	throw new Error('The standalone documentation must embed the Language Tools screenshot.');
}

console.log(`Built standalone documentation: dist/index.html (${documentHtml.length} bytes)`);
