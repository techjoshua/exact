import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { compileFileArtifacts } from '@exactjs/compiler';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { composeExactExecutorContract } from '@exactjs/server';
import { createExactNodeHandler } from '@exactjs/node-adapter';
import { renderToHydratableString } from '@exactjs/ssr';

const workspace = path.resolve(import.meta.dirname, '..');
const fixture = path.join(
	workspace,
	'packages/component-composition-corpus/test-support/task-progress'
);
await mkdir(path.join(workspace, '.tmp'), { recursive: true });
const temporary = await mkdtemp(path.join(workspace, '.tmp/progress-browser-'));
let server;
let browser;
try {
	const artifacts = await compileFileArtifacts(path.join(fixture, 'Page.tsx'), {
		rootDir: fixture,
		outDir: temporary
	});
	const serverBundle = path.join(temporary, 'server.mjs');
	await build({
		entryPoints: [artifacts.serverFile],
		outfile: serverBundle,
		bundle: true,
		platform: 'node',
		format: 'esm',
		packages: 'external'
	});
	const { ProgressPage } = await import(pathToFileURL(serverBundle).href);
	const contract = composeExactExecutorContract([ProgressPage], { endpoint: '/__exact' });
	const rendered = await renderToHydratableString(createCompiledComponentReceipt(ProgressPage, {}));
	const clientEntry = path.join(temporary, 'client.ts');
	await writeFile(
		clientEntry,
		`import {ProgressPage} from ${JSON.stringify(artifacts.clientFile)};
import {createCompiledComponentReceipt} from '@exactjs/core/runtime/component-operations';
import {composeExactComponentContracts} from '@exactjs/core/framework/component-contracts';
import {hydrate} from '@exactjs/hydrate';
const client=hydrate(createCompiledComponentReceipt(ProgressPage,{}),document.getElementById('root'),{
 ...composeExactComponentContracts([ProgressPage],'client'),endpoint:'/__exact',
 resumptions:JSON.parse(document.getElementById('resumptions').textContent)
});
window.disposeProgress=()=>{client.dispose();document.getElementById('root').remove();};
`
	);
	const clientBundle = path.join(temporary, 'client.js');
	await build({
		entryPoints: [clientEntry],
		outfile: clientBundle,
		bundle: true,
		platform: 'browser',
		format: 'esm',
		minify: true
	});
	const clientCode = await readFile(clientBundle);
	const html = `<!doctype html><html><body><main id="root">${rendered.html}</main><script id="resumptions" type="application/json">${JSON.stringify(rendered.resumptions).replaceAll('<', '\\u003c')}</script><script type="module" src="/client.js"></script></body></html>`;
	const failures = [];
	const handler = createExactNodeHandler({
		contract,
		logger: {
			log(event) {
				if (event.level === 'error' && !String(event.message).includes('invocation'))
					failures.push(event);
			}
		}
	});
	let requests = 0;
	server = createServer((request, response) => {
		if (request.url === '/__exact') {
			requests++;
			handler(request, response);
		} else if (request.url === '/client.js') {
			response.writeHead(200, { 'content-type': 'text/javascript' });
			response.end(clientCode);
		} else {
			response.writeHead(200, { 'content-type': 'text/html' });
			response.end(html);
		}
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	browser = await chromium.launch();
	const page = await browser.newPage();
	const errors = [];
	const diagnostics = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') diagnostics.push(message.text());
	});
	await page.goto(`http://127.0.0.1:${address.port}`);
	const text = async (id, value) =>
		page.waitForFunction(({ id, value }) => document.getElementById(id)?.textContent === value, {
			id,
			value
		});
	await page.click('#normal');
	await text('progress', '1');
	await text('progress', '100');
	await text('result', '1');
	await page.click('#slow');
	await text('result', '2');
	await text('active', 'false');
	await page.waitForTimeout(1100);
	await text('progress', '100');
	await page.click('#slow');
	await text('active', 'true');
	await page.click('#normal');
	await text('result', '4');
	await text('progress', '100');
	await page.click('#receiver-fail');
	await text('progress', '2');
	await text('result', '5');
	await text('progress', '100');
	assert.ok(
		diagnostics.some((message) => message.includes('Task progress receiver failed')),
		'Receiver failure must be diagnosed'
	);
	await page.click('#fail');
	await text('error', 'failed');
	await text('active', 'false');
	await page.click('#normal');
	await text('result', '7');
	await text('progress', '100');
	await page.click('#slow');
	await text('active', 'true');
	await page.evaluate(() => window.disposeProgress());
	await page.waitForTimeout(1100);
	assert.deepEqual(errors, [], 'No uncaught lifecycle or receiver errors');
	assert.deepEqual(failures, [], 'No unexpected server failures');
	assert.equal(requests, 8, 'Each interaction must invoke server work once');
	console.log(
		'Task progress browser acceptance passed: early delivery, async receivers, terminal fencing, supersession, receiver failure, server failure, recovery, disposal.'
	);
} finally {
	await browser?.close();
	if (server) {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	}
	await rm(temporary, { recursive: true, force: true });
}
