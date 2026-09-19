import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
for (const version of ['0.5.0', '0.6.0']) {
	const baselineDirectory = path.join(root, 'fixtures/release-abi', version);
	const integrity = JSON.parse(
		await readFile(path.join(baselineDirectory, 'integrity.json'), 'utf8')
	);
	for (const [filename, digest] of Object.entries(integrity))
		assert.equal(
			createHash('sha256')
				.update(await readFile(path.join(baselineDirectory, filename)))
				.digest('hex'),
			digest,
			`${version}/${filename} no longer matches its baseline`
		);
}
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://abi.exact.test/' });
const globals = new Map();
const names = [
	'window',
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'Text',
	'Comment',
	'Document',
	'DocumentFragment',
	'Event',
	'MouseEvent',
	'HTMLInputElement',
	'HTMLSelectElement',
	'HTMLTextAreaElement',
	'HTMLFormElement',
	'HTMLButtonElement',
	'HTMLScriptElement'
];
let mounted;
let hydrated;
try {
	for (const name of [...names, 'exactAbiDisposals']) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === 'exactAbiDisposals' ? 0 : dom.window[name]
		});
	}
	const container = document.createElement('main');
	container.innerHTML = '<button>preserved server output</button>';
	document.body.append(container);
	const existing = container.firstChild;
	for (const target of ['client', 'server']) {
		await assert.rejects(
			() =>
				loadTarget(
					target,
					`import { view } from './fixtures/release-abi/0.5.0/${target}.js'; export const operation = view();`
				),
			/Unsupported eXact (?:render-program|component artifact|component contract)/
		);
		assert.equal(container.firstChild, existing, 'incompatible artifacts fail before DOM mutation');
		assert.equal(
			globalThis.exactAbiDisposals,
			0,
			'incompatible artifacts never construct component owners'
		);
	}
	console.log(
		'Frozen 0.5.0 artifacts retain their integrity and are rejected before rendering by ABI epoch 2.'
	);
	{
		const client = await loadTarget(
			'client',
			`
import { view } from './fixtures/release-abi/0.6.0/client.js';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate/root';
export { flushSync } from '@exactjs/reactive';
export const mount = (container) => {
 render(view(), container);
 return { unmount: () => unmount(container) };
};
export const adopt = (container, resumptions) => hydrate(view(), container, { resumptions });
`,
			'0.6.0'
		);
		const server = await loadTarget(
			'server',
			`
import { view } from './fixtures/release-abi/0.6.0/server.js';
import { renderToHydratableString } from '@exactjs/ssr';
export const html = () => renderToHydratableString(view());
`,
			'0.6.0'
		);
		const container = document.createElement('main');
		document.body.append(container);
		const beforeMount = globalThis.exactAbiDisposals;
		mounted = client.mount(container);
		await exercise(container, client.flushSync);
		mounted.unmount();
		mounted = undefined;
		assert.equal(globalThis.exactAbiDisposals, beforeMount + 1, 'mount owns exactly one disposal');
		assert.equal(container.childElementCount, 0);
		const rendered = await server.html();
		assert.match(rendered.html, /Count 0/);
		container.innerHTML = rendered.html;
		const existing = container.querySelector('#increment');
		const beforeHydration = globalThis.exactAbiDisposals;
		hydrated = client.adopt(container, rendered.resumptions);
		assert.equal(
			container.querySelector('#increment'),
			existing,
			'hydration adopts the server node'
		);
		await exercise(container, client.flushSync);
		hydrated.dispose();
		hydrated = undefined;
		assert.equal(
			globalThis.exactAbiDisposals,
			beforeHydration + 1,
			'hydrated root owns exactly one disposal'
		);
		console.log(
			'Epoch-2 0.6.0 candidate artifacts pass client tasks, reactive updates, keyed identity, SSR, hydration, and disposal against the current runtime.'
		);
	}
} finally {
	mounted?.unmount();
	hydrated?.dispose();
	dom.window.close();
	for (const [name, descriptor] of globals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else delete globalThis[name];
	}
}

/** Loads preserved compiler output with current runtime packages, without invoking the compiler. */
async function loadTarget(target, contents, version = '0.5.0') {
	const result = await build({
		stdin: { contents, resolveDir: root, sourcefile: `abi-${target}.mjs` },
		bundle: true,
		write: false,
		format: 'esm',
		platform: target === 'client' ? 'browser' : 'node',
		conditions: target === 'client' ? ['browser'] : ['node'],
		target: 'es2022',
		logLevel: 'silent'
	});
	const output = path.join(root, '.tmp', 'compiled-abi-check', `${target}-${version}.mjs`);
	await mkdir(path.dirname(output), { recursive: true });
	await writeFile(output, result.outputFiles[0].contents);
	return import(pathToFileURL(output).href);
}

/** Exercises observable state, interaction, structural, and identity contracts of a preserved artifact. */
async function exercise(container, flush) {
	const button = container.querySelector('#increment');
	assert.equal(button.textContent, 'Count 0');
	assert.equal(container.querySelector('#positive'), null);
	const first = container.querySelector('li[data-id="1"]');
	button.click();
	await new Promise((resolve) => setImmediate(resolve));
	flush();
	assert.equal(button.textContent, 'Count 1');
	assert.equal(container.querySelector('#increment'), button);
	assert.equal(container.querySelector('#positive').textContent, 'positive');
	container.querySelector('#reverse').click();
	await new Promise((resolve) => setImmediate(resolve));
	flush();
	assert.deepEqual(
		[...container.querySelectorAll('li')].map((node) => node.dataset.id),
		['2', '1']
	);
	assert.equal(container.querySelector('li[data-id="1"]'), first);
}
