import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { compileProjectArtifacts } from '@exactjs/compiler';
import { createRuntimeAcceptanceEvidence, verifyRuntimeAcceptanceSources } from './evidence.mjs';

/** Builds paired authored list artifacts and checks their public behavior in an owned Chromium host. */
export async function checkAssignmentListBrowser(root, browser) {
	await mkdir(path.join(root, '.tmp'), { recursive: true });
	const temporary = await mkdtemp(path.join(root, '.tmp/assignment-list-browser-'));
	const fixture = path.join(
		root,
		'packages/component-composition-corpus/src/scenarios/assignment-list.fixtures.tsx'
	);
	const artifacts = await compileProjectArtifacts([fixture], {
		rootDir: root,
		outDir: path.join(temporary, 'artifacts')
	});
	const artifact = artifacts.find((value) => value.inputFile === fixture);
	assert.ok(artifact, 'Missing authored list artifact');
	const journey = path.join(
		root,
		'packages/component-composition-corpus/test-support/assignment-list-journey.mjs'
	);
	const clientEntry = path.join(temporary, 'client-entry.mjs');
	const serverEntry = path.join(temporary, 'server-entry.mjs');
	await writeFile(
		clientEntry,
		`import {assignmentListRoot,assignmentListOwner,assignmentListLifecycle} from ${JSON.stringify(artifact.clientFile)};
import {render,dispose} from '@exactjs/dom';
import {hydrate} from '@exactjs/hydrate';
import {flushSync,unwrap,watch} from '@exactjs/reactive';
import {verifyAssignmentList} from ${JSON.stringify(journey)};
export async function verify(retained,hydrated){let handle;const server=hydrated?await(await fetch('/state?retained='+retained)).json():undefined;
return verifyAssignmentList({owner:()=>assignmentListOwner,lifecycle:assignmentListLifecycle,flushSync,unwrap,watch,
async start(container,retained,server,onErrorReport){if(server){handle=hydrate(assignmentListRoot(retained),container,{resumptions:server.resumptions,onMismatch:'throw',onErrorReport,onDiagnostic:onErrorReport});await handle.whenSettled();}else render(assignmentListRoot(retained),container,{onErrorReport});},
release:container=>{handle?.dispose();dispose(container,true);}},retained,server);}`
	);
	await writeFile(
		serverEntry,
		`import {assignmentListRoot} from ${JSON.stringify(artifact.serverFile)};
import {renderToHydratableString} from '@exactjs/ssr';
export const reports=[];
export async function state(retained){const result=await renderToHydratableString(assignmentListRoot(retained),{logger:{log(event){if(event.level==='warn'||event.level==='error')reports.push(event);}}});return {html:result.html,resumptions:result.resumptions};}`
	);
	const clientFile = path.join(temporary, 'client.mjs');
	const serverFile = path.join(temporary, 'server.mjs');
	await build({
		entryPoints: [clientEntry],
		outfile: clientFile,
		bundle: true,
		platform: 'browser',
		format: 'esm',
		logLevel: 'silent'
	});
	await build({
		entryPoints: [serverEntry],
		outfile: serverFile,
		bundle: true,
		platform: 'node',
		format: 'esm',
		logLevel: 'silent'
	});
	const serverModule = await import(pathToFileURL(serverFile).href);
	const clientCode = await readFile(clientFile, 'utf8');
	const errors = [];
	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url, 'http://localhost');
			if (url.pathname === '/state') {
				response.setHeader('content-type', 'application/json');
				response.end(
					JSON.stringify(await serverModule.state(url.searchParams.get('retained') === 'true'))
				);
			} else if (url.pathname === '/client.mjs') {
				response.setHeader('content-type', 'text/javascript');
				response.end(clientCode);
			} else {
				response.setHeader('content-type', 'text/html');
				response.end('<!doctype html><body>');
			}
		} catch (error) {
			errors.push(String(error));
			response.writeHead(500).end(String(error));
		}
	});
	const executions = [];
	try {
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		const origin = 'http://127.0.0.1:' + server.address().port;
		for (const retained of [false, true])
			for (const hydrated of [false, true]) {
				const page = await browser.newPage();
				const faults = [];
				page.on('pageerror', (error) => faults.push(error.message));
				page.on('console', (message) => {
					if (message.type() === 'error' || message.type() === 'warning')
						faults.push(message.text());
				});
				try {
					await page.goto(origin);
					const result = await page.evaluate(
						async ({ retained, hydrated }) => {
							const { verify } = await import('/client.mjs');
							return verify(retained, hydrated);
						},
						{ retained, hydrated }
					);
					assert.deepEqual(result, { retained, hydrated, mounts: 1, unmounts: 1, reports: 0 });
					assert.deepEqual(faults, [], 'Unexpected Chromium reports');
					executions.push({ ...result, status: 'verified' });
				} finally {
					await page.close();
				}
			}
		assert.deepEqual(errors, [], 'Unexpected SSR host reports');
		assert.deepEqual(serverModule.reports, [], 'Unexpected framework SSR reports');
	} finally {
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	}
	const files = [
		fixture,
		journey,
		artifact.clientFile,
		artifact.serverFile,
		clientEntry,
		serverEntry,
		clientFile,
		serverFile
	];
	return {
		id: 'authored-assignment-list-chromium',
		executions,
		browser: browser.version(),
		artifacts: await Promise.all(
			files.map(async (file) => ({
				file: path.relative(root, file),
				sha256: createHash('sha256')
					.update(await readFile(file))
					.digest('hex')
			}))
		),
		cleanup: {
			pagesClosed: 4,
			httpServerClosed: !server.listening,
			frameworkReports: 0,
			browserFaults: 0,
			hostErrors: errors
		}
	};
}

// The dedicated command uses the same owned runner as aggregate native acceptance.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const root = path.resolve(import.meta.dirname, '../..');
	const report =
		process.env.EXACT_ACCEPTANCE_REPORT ??
		path.join(root, '.tmp/framework-confidence/assignment-browser-list-execution.json');
	await rm(report, { force: true });
	const evidence = await createRuntimeAcceptanceEvidence(root);
	const browser = await chromium.launch();
	try {
		evidence.executions.push(await checkAssignmentListBrowser(root, browser));
		await verifyRuntimeAcceptanceSources(root, evidence);
	} finally {
		await browser.close();
	}
	evidence.browserClosed = !browser.isConnected();
	evidence.success = true;
	evidence.finished = new Date().toISOString();
	await writeFile(report, JSON.stringify(evidence, null, 2) + '\n');
	console.log(JSON.stringify({ success: true, report, cases: 4 }));
}
