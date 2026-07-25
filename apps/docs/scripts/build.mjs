import { build } from 'vite';
import { exact } from '@exactjs/vite-plugin';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = join(root, '.build');
const clientRoot = join(buildRoot, 'client');
const serverRoot = join(buildRoot, 'server');
const outputRoot = join(root, 'dist');

await rm(buildRoot, { recursive: true, force: true });
await rm(outputRoot, { recursive: true, force: true });

await build({
	root,
	base: './',
	configFile: false,
	plugins: [exact()],
	build: {
		outDir: clientRoot,
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

await build({
	root,
	configFile: false,
	plugins: [exact()],
	build: {
		ssr: join(root, 'src/entry-server.tsx'),
		outDir: serverRoot,
		emptyOutDir: true,
		rollupOptions: {
			output: { entryFileNames: 'entry-server.mjs' }
		}
	}
});

const { renderStatic, renderStaticPages } = await import(
	`${pathToFileURL(join(serverRoot, 'entry-server.mjs')).href}?t=${Date.now()}`
);
const rendered = await renderStatic();
const renderedPages = renderStaticPages();
for (const page of renderedPages) {
	if (page.html.includes('That page is not in this map.')) {
		throw new Error(`Documentation route ${page.path} rendered the not-found page.`);
	}
	if (page.html.includes('Application error')) {
		throw new Error(`Documentation route ${page.path} rendered an application error.`);
	}
	if (page.html.includes('&amp;gt;') || page.html.includes('&amp;lt;')) {
		throw new Error(`Documentation route ${page.path} contains double-encoded code.`);
	}
}
const clientHtml = await readFile(join(clientRoot, 'index.html'), 'utf8');
const assets = await readdir(join(clientRoot, 'assets'));
const scriptName = assets.find((name) => name.endsWith('.js'));
const styleNames = assets.filter((name) => name.endsWith('.css'));
if (!scriptName) throw new Error('The documentation client build did not emit JavaScript.');

const script = (await readFile(join(clientRoot, 'assets', scriptName), 'utf8')).replace(
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
<div id="app">${rendered}</div>
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
if (
	!documentHtml.includes('Write the component. Do not rerun it.') ||
	!documentHtml.includes('exact:')
) {
	throw new Error(
		'The standalone documentation is missing prerendered content or hydration markers.'
	);
}

console.log(`Built standalone documentation: dist/index.html (${documentHtml.length} bytes)`);
console.log(`Verified ${renderedPages.length} documentation routes.`);
