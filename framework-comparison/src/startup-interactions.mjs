import { balancedRoundOrder } from './balanced-round-order.mjs';

/** Startup milestones and a controlled pre-script interaction window. */
export const startupInteractionPhases = ['domcontentloaded', 'load', 'pending-script'];

/**
 * Probes one trusted click at startup milestones and while client scripts are held.
 * Each attempt owns an independent page and releases held requests during cleanup.
 * Lost clicks remain failed outcomes. The probe never waits for application readiness or retries.
 */
export async function measureStartupInteractions(browser, participants, rounds = 5) {
	const results = [];
	for (const phase of startupInteractionPhases) {
		for (let round = 0; round < rounds; round++) {
			for (const participant of balancedRoundOrder(participants, round)) {
				const reset = await fetch('http://127.0.0.1:4310/__benchmark/reset', {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'x-benchmark-control': 'fixture-reset' },
					body: '{}'
				});
				if (!reset.ok) throw new Error('Startup probe could not reset the shared service');
				const context = await browser.newContext();
				let releaseScripts = () => {};
				try {
					const page = await context.newPage();
					const errors = [];
					page.on('pageerror', (error) => errors.push(String(error)));
					page.on('console', (message) => {
						if (message.type() === 'error') errors.push(message.text());
					});
					await page.addInitScript(() => {
						document.addEventListener(
							'click',
							(event) => {
								if (event.target.closest?.('button')?.textContent.trim() !== 'Claim incident')
									return;
								globalThis.__startupClick = {
									atMs: performance.now(),
									serviceReady:
										document.querySelector('.connection')?.textContent?.includes('Live service') ??
										false
								};
							},
							{ capture: true, once: true }
						);
					});
					const session = await context.newCDPSession(page);
					await session.send('Network.enable');
					await session.send('Network.setCacheDisabled', { cacheDisabled: true });
					let heldRequests = 0;
					const scriptGate = new Promise((resolve) => {
						releaseScripts = resolve;
					});
					if (phase === 'pending-script')
						await page.route(/\.m?js(?:\?|$)/, async (route) => {
							heldRequests++;
							await scriptGate;
							await route.continue();
						});
					await page.goto(`${participant.url}/incidents/inc-100`, {
						waitUntil: phase === 'pending-script' ? 'commit' : phase
					});
					await page.waitForFunction(() =>
						[...document.querySelectorAll('button')].some(
							(button) => button.textContent.trim() === 'Claim incident'
						)
					);
					const bounds = await page.evaluate(() =>
						[...document.querySelectorAll('button')]
							.find((button) => button.textContent.trim() === 'Claim incident')
							?.getBoundingClientRect()
							.toJSON()
					);
					if (!bounds) throw new Error('SSR claim button is missing');
					const position = {
						x: bounds.x + bounds.width / 2,
						y: bounds.y + bounds.height / 2,
						button: 'left',
						clickCount: 1
					};
					await session.send('Input.dispatchMouseEvent', { ...position, type: 'mousePressed' });
					await session.send('Input.dispatchMouseEvent', { ...position, type: 'mouseReleased' });
					releaseScripts();
					if (phase === 'pending-script' && !heldRequests)
						throw new Error('Startup probe did not hold any client script');
					let passed = true;
					try {
						await page.getByText('Version 2', { exact: true }).waitFor({ timeout: 2000 });
					} catch (error) {
						if (error.name !== 'TimeoutError') throw error;
						passed = false;
					}
					const click = await page.evaluate(() => globalThis.__startupClick);
					if (!click || errors.length)
						throw new Error(
							`Invalid startup probe: ${errors.join('; ') || 'click was not dispatched'}`
						);
					results.push({ participant: participant.id, phase, round, passed, ...click });
				} finally {
					releaseScripts();
					await context.unrouteAll({ behavior: 'ignoreErrors' });
					await context.close();
				}
			}
		}
	}
	return { rounds, timeoutMs: 2000, results };
}
