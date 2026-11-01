import { isPreservedAbiRejection } from './compiled-abi-rejection.mjs';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const policy = JSON.parse(
	await readFile(path.join(root, 'scripts/contracts/release-abi.json'), 'utf8')
);
const frozenSources = new Map();
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
for (const version of ['0.5.0', '0.6.0'])
	for (const target of ['client', 'server'])
		frozenSources.set(
			`${version}/${target}`,
			await readFile(path.join(root, 'fixtures/release-abi', version, target + '.js'), 'utf8')
		);
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
	for (const version of ['0.5.0', '0.6.0']) {
		for (const target of ['client', 'server']) {
			await assert.rejects(
				() =>
					loadTarget(
						target,
						`import { view } from './fixtures/release-abi/${version}/${target}.js'; export const operation = view();`,
						version
					),
				(error) =>
					isPreservedAbiRejection(error, {
						version,
						target,
						source: frozenSources.get(`${version}/${target}`)
					})
			);
			assert.equal(
				container.firstChild,
				existing,
				'incompatible artifacts fail before DOM mutation'
			);
			assert.equal(
				globalThis.exactAbiDisposals,
				0,
				'incompatible artifacts never construct component owners'
			);
		}
	}
	console.log(
		`Frozen 0.5.0 and 0.6.0 artifacts retain integrity and reject before rendering under ABI epoch ${policy.epoch}.`
	);
} finally {
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
