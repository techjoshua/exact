import { measureRetainedMemory } from './browser-memory.mjs';
import {
	summarizeCpuProfile,
	summarizeFrameworkProfileEvents,
	summarizeHeapSamplingProfile
} from './client-profile-analysis.mjs';
import { captureHeapDominators } from './browser-heap-snapshot.mjs';

const CPU_SAMPLING_INTERVAL_MICROSECONDS = 100;
const HEAP_SAMPLING_INTERVAL_BYTES = 4 * 1024;
const INTERACTION_CPU_THROTTLE_RATE = 6;
const HEAP_DOMINATORS_ENABLED = process.env.COMPARISON_HEAP_DOMINATORS === '1';

/**
 * Captures one untimed cold-start profile and the first interaction profile for a participant.
 * This diagnostic lane remains separate from percentile samples because both profilers perturb work.
 */
export async function captureClientProfile(browser, participant, resetService) {
	await resetService({});
	const context = await browser.newContext();
	const page = await context.newPage();
	const session = await context.newCDPSession(page);
	let cpuRunning = false;
	let heapRunning = false;
	let coverageRunning = false;
	try {
		await session.send('Network.enable');
		await session.send('Network.setCacheDisabled', { cacheDisabled: true });
		await session.send('Performance.enable');
		await session.send('Profiler.enable');
		await session.send('HeapProfiler.enable');
		await session.send('Profiler.setSamplingInterval', {
			interval: CPU_SAMPLING_INTERVAL_MICROSECONDS
		});
		await session.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
		coverageRunning = true;

		await session.send('HeapProfiler.startSampling', {
			samplingInterval: HEAP_SAMPLING_INTERVAL_BYTES
		});
		heapRunning = true;
		await session.send('Profiler.start');
		cpuRunning = true;
		await page.goto(`${participant.url}/incidents/inc-100`, { waitUntil: 'domcontentloaded' });
		await waitForSemanticReady(page);
		const frameworkProfileEvents = await page.evaluate(
			() => globalThis.__exactComparisonProfileEvents ?? []
		);
		const startupCoverage = (await session.send('Profiler.takePreciseCoverage')).result.filter(
			(script) => /^https?:/.test(script.url)
		);
		await session.send('Profiler.stopPreciseCoverage');
		coverageRunning = false;
		const startupCpu = (await session.send('Profiler.stop')).profile;
		cpuRunning = false;
		const startupHeap = (await session.send('HeapProfiler.stopSampling')).profile;
		heapRunning = false;

		await session.send('Emulation.setCPUThrottlingRate', { rate: INTERACTION_CPU_THROTTLE_RATE });
		await session.send('HeapProfiler.startSampling', {
			samplingInterval: HEAP_SAMPLING_INTERVAL_BYTES
		});
		heapRunning = true;
		await session.send('Profiler.start');
		cpuRunning = true;
		await runProfiledInteraction(page);
		const interactionCpu = (await session.send('Profiler.stop')).profile;
		cpuRunning = false;
		const interactionHeapBeforeGc = (await session.send('HeapProfiler.getSamplingProfile')).profile;
		await session.send('HeapProfiler.collectGarbage');
		const interactionHeapAfterGc = (await session.send('HeapProfiler.stopSampling')).profile;
		heapRunning = false;
		const retainedMemory = await measureRetainedMemory(session);
		const dominators = HEAP_DOMINATORS_ENABLED ? await captureHeapDominators(session) : undefined;

		return {
			configuration: {
				cpuSamplingIntervalMicroseconds: CPU_SAMPLING_INTERVAL_MICROSECONDS,
				heapSamplingIntervalBytes: HEAP_SAMPLING_INTERVAL_BYTES,
				interactionCpuThrottleRate: INTERACTION_CPU_THROTTLE_RATE,
				cache: 'disabled'
			},
			startup: {
				cpu: { summary: summarizeCpuProfile(startupCpu), profile: startupCpu },
				heap: { summary: summarizeHeapSamplingProfile(startupHeap), profile: startupHeap },
				framework: {
					events: frameworkProfileEvents,
					summary: summarizeFrameworkProfileEvents(frameworkProfileEvents)
				},
				coverage: startupCoverage
			},
			interaction: {
				cpu: { summary: summarizeCpuProfile(interactionCpu), profile: interactionCpu },
				heapBeforeGc: {
					summary: summarizeHeapSamplingProfile(interactionHeapBeforeGc),
					profile: interactionHeapBeforeGc
				},
				heapAfterGc: {
					summary: summarizeHeapSamplingProfile(interactionHeapAfterGc),
					profile: interactionHeapAfterGc
				},
				retainedMemory,
				...(dominators ? { dominators } : {})
			}
		};
	} finally {
		if (cpuRunning) await session.send('Profiler.stop').catch(() => undefined);
		if (heapRunning) await session.send('HeapProfiler.stopSampling').catch(() => undefined);
		if (coverageRunning) await session.send('Profiler.stopPreciseCoverage').catch(() => undefined);
		await context.close();
	}
}

function waitForSemanticReady(page) {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const ready = () =>
					document.body.textContent?.includes('Checkout authorization failures') &&
					document.querySelector('.connection')?.textContent?.includes('Live service');
				if (ready()) return resolve();
				const observer = new MutationObserver(() => {
					if (!ready()) return;
					clearTimeout(timeout);
					observer.disconnect();
					resolve();
				});
				const timeout = setTimeout(() => {
					observer.disconnect();
					reject(new Error('Profiled client did not reach semantic readiness'));
				}, 5_000);
				observer.observe(document, { childList: true, characterData: true, subtree: true });
			})
	);
}

function runProfiledInteraction(page) {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const settled = () => {
					const owner = document
						.querySelector('.facts > div:first-child strong')
						?.textContent?.trim();
					const version = document.querySelector('.version')?.textContent?.trim();
					return owner === 'Alex Chen' && version === 'Version 2';
				};
				const observer = new MutationObserver(() => {
					if (!settled()) return;
					clearTimeout(timeout);
					observer.disconnect();
					resolve();
				});
				const timeout = setTimeout(() => {
					observer.disconnect();
					reject(new Error('Profiled optimistic interaction did not settle'));
				}, 5_000);
				observer.observe(document, { childList: true, characterData: true, subtree: true });
				const button = [...document.querySelectorAll('button')].find(
					(candidate) => candidate.textContent?.trim() === 'Claim incident'
				);
				if (!(button instanceof HTMLButtonElement)) {
					clearTimeout(timeout);
					observer.disconnect();
					reject(new Error('Profiled client omitted the claim button'));
					return;
				}
				button.click();
			})
	);
}
