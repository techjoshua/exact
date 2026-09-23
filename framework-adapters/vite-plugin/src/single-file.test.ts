import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { build } from 'vite';
import { exactSingleFile } from './single-file.js';

/** Uses real Vite output to protect HTML embedding and artifact closure. */
async function fixture(files: Record<string, string>, run: (root: string) => Promise<void>) {
	const root = await mkdtemp(path.resolve('.tmp/single-file-'));
	try {
		await writeFile(
			path.join(root, 'package.json'),
			'{"name":"single-file-fixture","type":"module"}'
		);
		for (const [name, source] of Object.entries(files)) {
			await mkdir(path.dirname(path.join(root, name)), { recursive: true });
			await writeFile(path.join(root, name), source);
		}
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

it('embeds scripts, dynamic imports, CSS, images, and fonts into one HTML document', async () => {
	await fixture(
		{
			'index.html':
				'<html><head></head><body><img src="./mark.svg"><script type="module" src="./main.ts"></script></body></html>',
			'main.ts':
				'import "./style.css"; import("./lazy.ts").then(module => document.body.dataset.ready = module.value);',
			'lazy.ts': 'export const value = "ready";',
			'style.css':
				'@font-face { font-family: fixture; src: url("./font.woff2"); } body { background-image: url("./mark.svg"); }',
			'mark.svg':
				'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>',
			'font.woff2': 'fixture-font-bytes'
		},
		async (root) => {
			await build({
				root,
				configFile: false,
				plugins: [exactSingleFile({ applicationRoot: root })],
				logLevel: 'silent'
			});
			expect(await readdir(path.join(root, 'dist'))).toEqual(['index.html']);
			const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
			expect(html).toContain('data:image/svg+xml');
			expect(html).toContain('data:font/woff2');
			expect(html).toContain('ready');
			expect(html).not.toMatch(/<script[^>]+src=/);
			expect(html).not.toContain('<link');
		}
	);
});

it.each([
	[
		'external CSS',
		'<link rel="stylesheet" href="https://example.invalid/style.css">',
		'cannot embed'
	],
	['public asset', '<img src="/missing.png">', 'unembedded asset'],
	['worker', '<script type="module" src="./worker-entry.ts"></script>', 'worker']
])(
	'rejects unsupported %s dependencies instead of emitting a broken offline app',
	async (_name, content, error) => {
		await fixture(
			{
				'index.html': `<html><head></head><body>${content}</body></html>`,
				'worker-entry.ts':
					'new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });',
				'worker.ts': 'self.postMessage("ready");'
			},
			async (root) => {
				await expect(
					build({
						root,
						configFile: false,
						plugins: [exactSingleFile({ applicationRoot: root })],
						logLevel: 'silent'
					})
				).rejects.toThrow(error);
			}
		);
	}
);

it('rejects compiler-proven server operations', async () => {
	await fixture(
		{
			'index.html':
				'<html><body><div id="app"></div><script type="module" src="./main.tsx"></script></body></html>',
			'main.tsx': `import {TaskContext,type Component} from '@exactjs/core'; import {render} from '@exactjs/dom'; function App(this:Component<{count:number}>){this.state.count=0;const run=async(task:TaskContext=TaskContext.server())=>{this.state.count++;};return ()=> <button onclick={()=>run()}>{this.state.count}</button>;} render(<App/>,document.getElementById('app')!);`
		},
		async (root) => {
			await expect(
				build({
					root,
					configFile: false,
					plugins: [exactSingleFile({ applicationRoot: root })],
					logLevel: 'silent'
				})
			).rejects.toThrow('cannot execute server components or server tasks');
		}
	);
});

it('rejects already-compiled packages that require a server continuation', async () => {
	await fixture(
		{
			'index.html': '<script type="module" src="./compiled.js"></script>',
			'compiled.js':
				'import {dispatchComponentContinuation as send} from "@exactjs/core/runtime/tasks"; globalThis.run = send;'
		},
		async (root) => {
			await expect(
				build({
					root,
					configFile: false,
					plugins: [exactSingleFile({ applicationRoot: root })],
					logLevel: 'silent'
				})
			).rejects.toThrow('packaged server continuation');
		}
	);
});
