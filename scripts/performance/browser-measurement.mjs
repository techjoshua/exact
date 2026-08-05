import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { summarizeScenario, summarizeValues } from './measurement.mjs';

/** Measures the compiled client fixture in independent current-Chromium processes. */
export async function measureChromium(outputDirectory, samples, warmups) {
	const html = `<!doctype html>
<meta charset="utf-8">
<div id="root"></div>
<script>window.__exactPerformanceStart = performance.now();</script>
<script type="module" src="/browser-entry.js"></script>`;
	const server = await startServer(outputDirectory, html);
	try {
		const processSamples = [];
		let version = '';
		for (let index = 0; index < samples; index++) {
			let browser;
			try {
				browser = await chromium.launch({
					headless: true,
					args: ['--enable-precise-memory-info', '--js-flags=--expose-gc']
				});
			} catch (error) {
				throw new Error(
					`Current Chromium is required by the framework performance baseline: ${firstLine(error)}`
				);
			}
			try {
				version ||= browser.version();
				const page = await browser.newPage();
				await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => typeof window.__exactPerformance?.run === 'function');
				const result = await page.evaluate(
					async (warmupCount) => await window.__exactPerformance.run(warmupCount),
					warmups
				);
				validateBrowserResult(result);
				processSamples.push(result);
			} finally {
				await browser.close();
			}
		}

		const scenarioNames = Object.keys(processSamples[0].results);
		return {
			browser: `Chromium ${version}`,
			samples,
			moduleEvaluationMs: summarizeValues(processSamples.map((sample) => sample.evaluationMs)),
			results: scenarioNames.map((scenario) =>
				summarizeScenario(
					scenario,
					processSamples.map((sample) => ({
						scenario,
						moduleEvaluationMs: sample.evaluationMs,
						...sample.results[scenario]
					}))
				)
			)
		};
	} finally {
		await server.close();
	}
}

async function startServer(outputDirectory, html) {
	const server = createServer(async (request, response) => {
		try {
			const requestPath = request.url === '/' ? undefined : request.url?.split('?', 1)[0];
			if (!requestPath) {
				response.setHeader('content-type', 'text/html; charset=utf-8');
				response.end(html);
				return;
			}
			const relative = decodeURIComponent(requestPath).replace(/^\/+/, '');
			const filename = path.resolve(outputDirectory, relative);
			if (!filename.startsWith(`${path.resolve(outputDirectory)}${path.sep}`)) {
				response.statusCode = 403;
				response.end('forbidden');
				return;
			}
			response.setHeader('content-type', contentType(filename));
			response.end(await readFile(filename));
		} catch (error) {
			response.statusCode = 404;
			response.end(String(error));
		}
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string')
		throw new Error('performance server did not bind TCP');
	return {
		port: address.port,
		close: () => new Promise((resolve) => server.close(resolve))
	};
}

function contentType(filename) {
	if (filename.endsWith('.js') || filename.endsWith('.mjs'))
		return 'text/javascript; charset=utf-8';
	if (filename.endsWith('.map')) return 'application/json; charset=utf-8';
	return 'application/octet-stream';
}

function validateBrowserResult(result) {
	if (!result || typeof result !== 'object' || !Number.isFinite(result.evaluationMs))
		throw new Error('Chromium fixture did not report module evaluation');
	if (!result.results || Object.keys(result.results).length === 0)
		throw new Error('Chromium fixture completed without scenario results');
}

function firstLine(error) {
	return String(error).split(/\r?\n/, 1)[0];
}
