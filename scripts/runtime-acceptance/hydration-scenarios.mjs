import {
	captureAccessibilityServer,
	captureAccessibility,
	verifyRetainedAccessibility,
	verifyDisposedAccessibility
} from './accessibility.mjs';
import {
	captureMountWork,
	captureMountWorkServerTemplate,
	verifyRetainedMountWork,
	verifyDisposedMountWork
} from './mount-work.mjs';
import { collectBrowserErrors } from './browser-errors.mjs';
import { checkEarlyNativeControls } from './hydration-control-scenarios.mjs';
import { checkBrowserUrlCoercion } from './url-scenarios.mjs';
import { checkSerializationScripts, checkBrowserJsonData } from './serialization-scenarios.mjs';
import { verifySourceNormalization } from '../../packages/component-composition-corpus/test-support/source-normalization-journey.mjs';
import {
	verifyComputedComponentMembers,
	verifyComputedMemberDisposal
} from '../../packages/component-composition-corpus/test-support/computed-component-members-journey.mjs';
import { intlProjectionExpected } from '../../packages/component-composition-corpus/test-support/intl-projection-journey.mjs';
import { verifyFormBindingControls } from '../../packages/component-composition-corpus/test-support/form-binding-journey.mjs';
import { verifyInputRelationships } from '../../packages/component-composition-corpus/test-support/input-relationship-journey.mjs';
import { verifyRenderAttributeOrder } from '../../packages/component-composition-corpus/test-support/render-attribute-journey.mjs';
import { verifyTargetAttributeOwnership } from '../../packages/component-composition-corpus/test-support/target-attribute-journey.mjs';
import { verifyMutationContract } from '../../packages/component-composition-corpus/test-support/mutation-contract-journey.mjs';
import {
	verifyCollectionProjection,
	verifyDerivedPattern
} from '../../packages/component-composition-corpus/test-support/collection-projection-journey.mjs';
import { verifyTimePlanOwnership } from '../../packages/component-composition-corpus/test-support/time-plan-journey.mjs';
import {
	verifyReplacementOwnership,
	verifyArrayRollbackOwnership
} from '../../packages/component-composition-corpus/test-support/replacement-journey.mjs';
import { checkSsrReadiness } from './native-scenarios.mjs';
import { checkEagerReplay } from './eager-replay.mjs';
import { checkExternalSourceBrowser } from './task-captures.mjs';
import { checkBootstrapLoading } from './bootstrap-scenarios.mjs';
import assert from 'node:assert/strict';
import { request, json } from './test-support.mjs';

/** Verifies native SSR output, DOM adoption, repeated remote updates and client disposal. */
export async function checkHydration(origin, browser, control) {
	await checkExternalSourceBrowser(origin, browser);
	const escaped = await json(await request(new URL('/hydration-escaping', origin)));
	const safety = await json(await request(new URL('/serialization-safety', origin)));

	const escapingPage = await browser.newPage();
	try {
		await checkSerializationScripts(escapingPage, safety.scripts);
		for (const { value, script } of escaped) {
			await escapingPage.setContent(script + '<p id="after-hydration">after</p>');
			const observed = await escapingPage.evaluate(() => ({
				scripts: document.querySelectorAll('script').length,
				state: JSON.parse(document.querySelector('script').textContent).state,
				after: document.getElementById('after-hydration')?.textContent
			}));
			assert.deepEqual(observed, { scripts: 1, state: { [value]: value }, after: 'after' });
		}
	} finally {
		await escapingPage.close();
	}
	await checkSsrReadiness(origin, control);
	await checkBootstrapLoading(origin, browser);
	await checkEagerReplay(origin, browser);

	for (const route of [
		'/page',
		'/stream-page',
		'/committed-page',
		'/island-page',
		'/stream-island-page'
	]) {
		const response = await request(new URL(route, origin));
		const html = await response.text();
		assert.equal(response.status, 200, html);
		if (route.includes('island-page')) assert.match(html, /data-exact-client-name="RuntimeIsland"/);
		assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt; café 😀/);
		assert.match(html, /__exact_hydration/);
		assert.doesNotMatch(html, /<script>unsafe<\/script>/);
		assert.match(html, /<output id="server-availability"[^>]*>available<\/output>/);
		assert.match(html, /title="settled"/);
		assert.match(html, /id="deferred-spread"[^>]*data-spread="ready"/);
		assert.doesNotMatch(html, /title="\[object Object\]"/);
		const page = await browser.newPage();
		const diagnosticCapture = collectBrowserErrors(page);
		const { errors } = diagnosticCapture;
		let requests = 0;
		page.on('request', (request) => {
			if (new URL(request.url()).pathname === '/__exact') requests++;
		});
		page.setDefaultTimeout(10000);
		try {
			await page.goto(new URL(route, origin).href);
			assert.equal(await page.locator('#server-availability').textContent(), 'available');
			assert.equal(await page.locator('#client-status').textContent(), '0:idle');
			assert.equal(await page.locator('#fragment-scope').textContent(), 'outer');
			assert.equal(await page.locator('#fragment-sibling').textContent(), 'root');
			assert.equal(await page.locator('#deferred-spread').getAttribute('data-spread'), 'ready');
			assert.equal(await page.locator('#deferred-spread').getAttribute('data-scope'), 'deferred');
			assert.equal(await page.locator('#intl-initial').textContent(), '1.234,5');
			await page.evaluate(() => {
				window.originalCounter = document.querySelector('#count');
				window.originalFormInput = document.querySelector('#form-number-text');
				window.originalNumericRange = document.querySelector('#numeric-range-result');
				window.originalIntlProjection = document.querySelector('#intl-projection-result');
				window.originalNormalization = document.querySelector('#normalization-result');
				window.originalSnapshot = document.querySelector('#normalization-snapshot-result');
				window.originalHelperSnapshot = document.querySelector('#normalization-helper-result');
				window.originalStartup = document.querySelector('#normalization-startup-result');
				window.originalScalarRun = document.querySelector('#scalar-run');
				window.originalScalarText = [...window.originalScalarRun.childNodes].find(
					(node) => node.nodeType === Node.TEXT_NODE
				);
				window.originalScope = document.querySelector('#fragment-scope');
				window.originalDeferredSpread = document.querySelector('#deferred-spread');
				window.originalInput = document.querySelector('#draft');
				window.originalInput.value = 'edited before hydration';
				document.querySelector('#early-disclosure').open = false;
				document.querySelector('#early-dialog').close();
				window.originalInput.focus();
				window.originalInput.setSelectionRange(2, 7);
				window.originalUpload = document.querySelector('#upload');
				const transfer = new DataTransfer();
				transfer.items.add(new File(['owned fixture'], 'proof.txt'));
				window.originalUpload.files = transfer.files;
			});
			await captureMountWorkServerTemplate(page);
			await captureAccessibilityServer(page);
			await page.addScriptTag({ url: new URL('/client.js', origin).href, type: 'module' });
			await page.waitForFunction(() => window.runtimeReady);
			await captureMountWork(page, route);
			await captureAccessibility(page);
			await checkEarlyNativeControls(page);
			await page.evaluate(() => window.verifyHydrationFormRecovery());
			await page.evaluate(() => window.verifyDomInspectionIdentity());
			await page.evaluate(() => window.verifyPortalEventOwnership());
			if (route === '/page') {
				await checkBrowserJsonData(page);
				await checkBrowserUrlCoercion(page);
			}
			await page.evaluate(async (journey) => {
				await (0, eval)('(' + journey + ')')(document);
			}, verifyRenderAttributeOrder.toString());
			await page.evaluate(async (source) => {
				const verify = new Function('return (' + source + ')')();
				window.propsProbeNodes = await verify(
					document,
					window.propsProbeOwner(),
					window.flushPropsProbe
				);
				if (
					document.querySelectorAll('[data-applied-variant]').length !== 3 ||
					[...document.querySelectorAll('[data-applied-variant]')].some(
						(node) => node.textContent !== 'absent'
					)
				)
					throw new Error('Lost applied context capability');
			}, verifyInputRelationships.toString());
			assert.deepEqual(
				await page.evaluate(() => ({
					focused: document.activeElement === window.originalInput,
					start: window.originalInput.selectionStart,
					end: window.originalInput.selectionEnd
				})),
				{ focused: true, start: 2, end: 7 },
				'Hydration must preserve focus and selection on the retained authored input'
			);
			assert.equal(
				await page.evaluate(
					() => window.originalFormInput === document.querySelector('#form-number-text')
				),
				true
			);
			await page.evaluate(async (journey) => {
				const verify = (0, eval)('(' + journey + ')');
				await verify(
					document,
					() =>
						new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
				);
			}, verifyFormBindingControls.toString());
			for (const step of [0, 1, 2]) {
				assert.equal(
					await page.locator('#intl-projection-result').textContent(),
					intlProjectionExpected(step, 'de-DE')
				);
				assert.equal(
					await page.evaluate(
						() =>
							window.originalIntlProjection === document.querySelector('#intl-projection-result')
					),
					true
				);
				if (step < 2) await page.click('#intl-projection-next');
			}
			await verifySourceNormalization(page);
			await verifyComputedComponentMembers(page);
			for (const end of [1, 2, 3]) {
				const expected = await page.evaluate((end) => {
					const number = new Intl.NumberFormat('en-US').formatRange(1, end);
					const currency = new Intl.NumberFormat('en-US', {
						style: 'currency',
						currency: 'USD',
						currencyDisplay: 'code'
					}).formatRange(1, end);
					return number + ' / ' + currency;
				}, end);
				assert.equal(await page.locator('#numeric-range-result').textContent(), expected);
				assert.equal(
					await page.evaluate(
						() => window.originalNumericRange === document.querySelector('#numeric-range-result')
					),
					true
				);
				if (end < 3) await page.click('#numeric-range-next');
			}
			assert.equal(
				await page.evaluate(
					() => window.originalScalarRun === document.querySelector('#scalar-run')
				),
				true,
				'Scalar adoption must retain the server host'
			);
			assert.equal(
				await page.evaluate(() =>
					[...window.originalScalarRun.childNodes].includes(window.originalScalarText)
				),
				true,
				'Scalar adoption must retain the first server Text'
			);
			assert.equal(await page.locator('#scalar-run').textContent(), 'first / second 😀');
			for (const expected of ['next / last 😀', '', 'again!']) {
				await page.click('#scalar-change');
				await page.waitForFunction(
					(value) => document.querySelector('#scalar-run').textContent === value,
					expected
				);
				assert.equal(
					await page.evaluate(
						() => window.originalScalarRun === document.querySelector('#scalar-run')
					),
					true
				);
			}
			await page.evaluate(() => window.verifyDormantIslandActivation());
			await page.evaluate(verifyTimePlanOwnership);
			await page.evaluate(verifyReplacementOwnership);
			await page.evaluate(verifyArrayRollbackOwnership);
			await page.evaluate(verifyCollectionProjection);
			await page.evaluate(verifyDerivedPattern);
			await page.evaluate(verifyMutationContract);
			await page.evaluate(verifyTargetAttributeOwnership);
			assert.equal(await page.locator('[data-server-mutation-contract]').textContent(), '5:1');
			assert.equal(
				await page.evaluate(
					() => window.originalScope === document.querySelector('#fragment-scope')
				),
				true,
				'Enhancement contexts must survive adoption without replacing their descendants'
			);
			await diagnosticCapture.flush();
			await diagnosticCapture.releaseFrames();
			assert.deepEqual(errors, [], route);
			assert.equal(await page.locator('#map-total').textContent(), '0');
			assert.equal(await page.locator('#server-availability').textContent(), 'available');
			assert.equal(await page.locator('#client-status').textContent(), '0:idle');
			await verifyRetainedMountWork(page);
			await verifyRetainedAccessibility(page);
			assert.equal(await page.locator('#fragment-scope').textContent(), 'outer');
			assert.equal(
				await page.evaluate(
					() => window.originalDeferredSpread === document.querySelector('#deferred-spread')
				),
				true
			);
			assert.equal(await page.locator('#fragment-sibling').textContent(), 'root');
			assert.equal(await page.locator('#intl-initial').textContent(), '1.234,5');
			assert.equal(await page.locator('#set-size').textContent(), '1');
			assert.equal(await page.locator('#settled-target').getAttribute('title'), 'settled');
			await page.click('#slow');
			// The controlled service confirms the older continuation is suspended.
			const deadline = Date.now() + 10000;
			let pending;
			do {
				pending = await json(await request(new URL('/status', control)));
				if (pending.pending.includes(route)) break;
				await new Promise((resolve) => setTimeout(resolve, 10));
			} while (Date.now() < deadline);
			assert.ok(
				pending.pending.includes(route),
				'Older continuation must suspend before unrelated work'
			);
			await page.locator('[data-generation-step]').first().click();
			await page.waitForFunction(
				() =>
					document.querySelector('[data-generation-state]')?.textContent === 'published' &&
					document.querySelector('[data-closure-state]')?.textContent === 'published'
			);
			for (const count of [1, 2]) {
				const completed = page.waitForResponse(
					(response) => new URL(response.url()).pathname === '/__exact'
				);
				await page.click('#increment');
				const response = await completed;
				assert.equal(
					response.status(),
					200,
					response.status() === 200 ? undefined : await response.text()
				);
				await page.waitForFunction(
					(expected) => document.querySelector('#count').textContent === String(expected),
					count
				);
				await page.waitForFunction(
					(expected) => document.querySelector('#returned').textContent === String(expected),
					count
				);
				assert.equal(
					await page.evaluate(
						() => window.originalScope === document.querySelector('#fragment-scope')
					),
					true,
					'A keyed enhanced fragment must retain its descendants after reactive updates'
				);
				assert.equal(await page.locator('#deferred-spread').getAttribute('data-spread'), 'updated');
				assert.equal(
					await page.evaluate(
						() => window.originalDeferredSpread === document.querySelector('#deferred-spread')
					),
					true,
					'A keyed enhanced host must survive hydration and reactive updates'
				);
				assert.equal(await page.locator('#profile-label').textContent(), 'native');
				assert.equal(await page.locator('#map-total').textContent(), String(count));
				assert.equal(await page.locator('#set-size').textContent(), '2');
				assert.equal(
					await page.locator('#intl-result').textContent(),
					count === 1 ? '1.235,5' : '1.236,5'
				);
			}
			await (await request(new URL('/release?id=' + encodeURIComponent(route), control))).text();
			await page.waitForFunction(() => document.querySelector('#slow-result').textContent === '42');
			assert.equal(
				await page.evaluate(() => window.originalCounter === document.querySelector('#count')),
				true,
				'Hydration and updates must preserve DOM identity'
			);
			assert.equal(await page.inputValue('#draft'), 'edited before hydration');
			assert.equal(
				await page.evaluate(() => window.originalInput === document.querySelector('#draft')),
				true
			);
			await verifyRetainedMountWork(page);
			await verifyRetainedAccessibility(page);
			await page.evaluate(() => {
				const retiredButton = document.querySelector('#increment');
				window.runtimeClient.dispose();
				if (window.propsProbeNodes) {
					window.propsProbeOwner().state.record.value = 30;
					window.flushPropsProbe();
					if (window.propsProbeNodes.some((node) => node.textContent !== '20'))
						throw new Error('Disposed input relationship remained active');
				}
				retiredButton.click();
			});
			await verifyDisposedMountWork(page);
			await verifyDisposedAccessibility(page);
			await page.waitForTimeout(50);
			await verifyComputedMemberDisposal(page);
			assert.equal(
				await page.locator('#count').count(),
				route.includes('island-page') ? 1 : 0,
				'Full-root disposal removes its mount, island disposal retains inert server markup'
			);
			assert.equal(requests, 7, 'Disposal must remove interaction ownership');
			assert.equal(await page.evaluate(() => window.responseObservations > 0), true);
			assert.equal(
				await page.evaluate(() =>
					window.hydrationObservations.some(
						(event) =>
							event.kind === (location.pathname.includes('island-page') ? 'island' : 'root')
					)
				),
				true
			);
			await page.evaluate(() => window.verifyEventResponsibility());
			await diagnosticCapture.flush();
			assert.deepEqual(errors, []);
		} catch (error) {
			throw new Error(route + ': ' + errors.join('; '), { cause: error });
		} finally {
			await page.close();
		}
	}
	const scopes = await json(await request(new URL('/page-state', origin)));
	assert.equal(
		scopes.created.length,
		scopes.disposed.length,
		'Completed SSR must release its request scopes'
	);
}
