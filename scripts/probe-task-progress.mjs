import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
	options: {
		url: { type: 'string' },
		request: { type: 'string' },
		headers: { type: 'string' },
		'minimum-gap-ms': { type: 'string', default: '500' },
		'timeout-ms': { type: 'string', default: '15000' }
	}
});
if (!values.url || !values.request)
	throw new Error(
		'Usage: npm run probe:task-progress -- --url URL --request operation.json [--headers headers.json]'
	);
const gap = Number(values['minimum-gap-ms']);
const timeout = Number(values['timeout-ms']);
if (!Number.isFinite(gap) || gap <= 0 || !Number.isSafeInteger(timeout) || timeout <= gap)
	throw new Error('Require a positive minimum gap and a longer integer timeout.');
const body = await readFile(values.request, 'utf8');
const operation = JSON.parse(body);
if (operation.type !== 'invoke' || typeof operation.id !== 'string')
	throw new Error(
		'Provide one generated invocation request for a safe, deliberately paced probe task.'
	);
const headers = new Headers(
	values.headers ? JSON.parse(await readFile(values.headers, 'utf8')) : {}
);
headers.set('content-type', 'application/json');
headers.set('accept', 'application/x-ndjson');
headers.set('x-exact-stream', '1');
headers.set('x-exact-progress', '1');
const response = await fetch(values.url, {
	method: 'POST',
	headers,
	body,
	signal: AbortSignal.timeout(timeout),
	redirect: 'error'
});
if (!response.ok || !response.body)
	throw new Error('Probe request did not return a successful stream.');
const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
let pending = '';
let firstProgress;
let resultAt;
let complete = false;
let bytes = 0;
try {
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) break;
		bytes += chunk.value.length;
		if (bytes > 1024 * 1024) throw new Error('Probe response exceeds 1 MiB.');
		pending += chunk.value;
		let newline;
		while ((newline = pending.indexOf('\n')) >= 0) {
			const line = pending.slice(0, newline);
			pending = pending.slice(newline + 1);
			if (!line.trim()) continue;
			const event = JSON.parse(line);
			if (event.event === 'progress') {
				if (event.index !== 0 || event.id !== operation.id || resultAt !== undefined)
					throw new Error('Unexpected progress identity or order.');
				firstProgress ??= performance.now();
			}
			if (event.event === 'result') {
				if (event.index !== 0 || event.result?.id !== operation.id || event.result?.ok !== true)
					throw new Error('Probe task did not complete successfully.');
				resultAt = performance.now();
			}
			if (event.event === 'complete') complete = true;
		}
	}
	if (pending.trim() || !complete || firstProgress === undefined || resultAt === undefined)
		throw new Error('Probe did not receive progress followed by a complete result.');
	const observedGap = resultAt - firstProgress;
	if (observedGap < gap)
		throw new Error(
			'Progress was buffered or the probe task did not pause long enough before completion.'
		);
	console.log(
		JSON.stringify({ progressBeforeResultMs: Math.round(observedGap), minimumGapMs: gap })
	);
} finally {
	await reader.cancel();
	reader.releaseLock();
}
