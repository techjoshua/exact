/** @vitest-environment jsdom */
import { appendFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { createPreparedServerComponentInputReference as serverReceipt } from '@exactjs/core/framework/server-render-structure';
import { currentEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { render, unmount } from '@exactjs/dom';
import { findElementOwner } from '@exactjs/dom/testing';
import { adoptDocumentCompiledComponentInputRoot } from '@exactjs/dom/framework/component-root';
import { renderToString } from '@exactjs/ssr';
import { hydrate } from './index.js';
import { hydrateCompiledComponentInputRoot } from './framework/component-root.js';
import { OccurrenceForwarding as Page } from '../../component-composition-corpus/test-support/component-child-input-forwarding.fixtures.js';
import { OccurrenceForwarding as ServerPage } from '../../component-composition-corpus/test-support/component-child-input-forwarding.fixtures.js?exact-target=server';
import { ChildInputDocument as DocumentPage } from '../../component-composition-corpus/test-support/component-child-input.fixtures.js';
import { ChildInputDocument as ServerDocument } from '../../component-composition-corpus/test-support/component-child-input.fixtures.js?exact-target=server';

/** Records observations before assertions without making file output part of the public contract. */
function observe(row: unknown): void {
	const file = process.env.EXACT_CHILD_INPUT_OBSERVATIONS;
	if (file) appendFileSync(file, JSON.stringify(row) + '\n');
}
const entries = [
	['compiled', hydrateCompiledComponentInputRoot],
	['public', hydrate]
] as const;
for (const [entry, hydrateRoot] of entries) {
	for (const markers of [false, true]) {
		for (const callback of ['none', 'diagnostic', 'logger'] as const) {
			it(`${entry} mismatch report preserves newer ownership: ${callback}, markers=${markers}`, async () => {
				const host = document.createElement('div');
				host.innerHTML = markers
					? (await renderToString(serverReceipt(ServerPage, { probe: { value: 'server' } }))).html
					: '<article>wrong</article>';
				document.body.append(host);
				const scopes: Array<EffectScope | undefined> = [],
					reports: unknown[] = [],
					events: unknown[] = [];
				let view: ReturnType<typeof hydrateRoot> | undefined;
				const reentry: { inner: Element | null } = { inner: null };
				let owner: ReturnType<typeof findElementOwner>;
				const reenter = () => {
					render(
						receipt(Page, {
							probe: {
								get value() {
									scopes.push(currentEffectScope());
									return 'inner';
								}
							}
						}),
						host
					);
					reentry.inner =
						[...host.querySelectorAll('i')].find((node) => findElementOwner(node)?.scope.active) ??
						null;
					owner = reentry.inner ? findElementOwner(reentry.inner) : undefined;
				};
				try {
					view = hydrateRoot(receipt(Page, { probe: { value: 'outer' } }), host, {
						allowMarkerless: true,
						onMismatch: 'replace',
						onErrorReport: (report) => reports.push(report.error),
						onHydration: (event) => events.push(event),
						onDiagnostic: callback === 'diagnostic' ? reenter : undefined,
						logger: {
							log(event) {
								if (callback === 'logger' && event.scope.category === 'mismatch') reenter();
							}
						}
					});
					observe({
						entry,
						markers,
						callback,
						text: host.textContent,
						sameNode: host.querySelector('i') === reentry.inner,
						innerConnected: reentry.inner?.isConnected,
						scopes: scopes.map((s) => s?.active),
						events,
						reports
					});
					if (callback === 'none') {
						expect(host.textContent).toBe('outer');
						return;
					}
					expect([...host.querySelectorAll('i')]).toContain(reentry.inner);
					expect(reentry.inner?.textContent).toBe('inner');
					expect(events).toEqual([]);
					view.dispose();
					expect(scopes.map((scope) => scope?.active)).toEqual([true]);
					expect([...host.querySelectorAll('i')]).toContain(reentry.inner);
					expect(reentry.inner?.textContent).toBe('inner');
					render(receipt(Page, { probe: { value: 'next' } }), host);
					expect([...host.querySelectorAll('i')]).toContain(reentry.inner);
					expect(reentry.inner && findElementOwner(reentry.inner)).toBe(owner);
					expect(reentry.inner?.textContent).toBe('next');
					expect(reports).toEqual([]);
				} finally {
					view?.dispose();
					unmount(host);
					host.remove();
					expect(scopes.every((scope) => scope && !scope.active)).toBe(true);
				}
			});
		}
	}
	it(`${entry} aggregate profile reentry leaves no stale handle ownership`, async () => {
		const host = document.createElement('div');
		host.innerHTML = (
			await renderToString(serverReceipt(ServerPage, { probe: { value: 'initial' } }))
		).html;
		document.body.append(host);
		const scopes: Array<EffectScope | undefined> = [];
		const reentry: { inner: Element | null } = { inner: null };
		let fired = false,
			view: ReturnType<typeof hydrateRoot> | undefined;
		try {
			view = hydrateRoot(receipt(Page, { probe: { value: 'initial' } }), host, {
				onMismatch: 'throw',
				onProfile(event) {
					if (!fired && event.subsystem === 'hydrate' && event.phase === 'hydrate') {
						fired = true;
						render(
							receipt(Page, {
								probe: {
									get value() {
										scopes.push(currentEffectScope());
										return 'inner';
									}
								}
							}),
							host
						);
						reentry.inner =
							[...host.querySelectorAll('i')].find(
								(node) => findElementOwner(node)?.scope.active
							) ?? null;
					}
				}
			});
			observe({
				case: 'profile',
				entry,
				fired,
				text: host.textContent,
				scopes: scopes.map((s) => s?.active)
			});
			expect(fired).toBe(true);
			expect(reentry.inner?.textContent).toBe('inner');
			view.dispose();
			expect([...host.querySelectorAll('i')]).toContain(reentry.inner);
			expect(scopes[0]?.active).toBe(true);
			render(receipt(Page, { probe: { value: 'next' } }), host);
			expect([...host.querySelectorAll('i')]).toContain(reentry.inner);
			expect(reentry.inner?.textContent).toBe('next');
		} finally {
			view?.dispose();
			unmount(host);
			host.remove();
			expect(scopes.every((s) => s && !s.active)).toBe(true);
		}
	});
	it(`${entry} document diagnostic reentry does not throw an obsolete mismatch`, async () => {
		const original = document.documentElement.outerHTML,
			output = await renderToString(serverReceipt(ServerDocument, { probe: { value: 'server' } }));
		document.open();
		document.write(output.html);
		document.close();
		const host = document.documentElement,
			scopes: Array<EffectScope | undefined> = [];
		let view: ReturnType<typeof hydrateRoot> | undefined,
			accepted = false;
		try {
			view = hydrateRoot(receipt(DocumentPage, { probe: { value: 'wrong' } }), document, {
				onMismatch: 'replace',
				onDiagnostic() {
					accepted =
						adoptDocumentCompiledComponentInputRoot(
							receipt(DocumentPage, {
								probe: {
									get value() {
										scopes.push(currentEffectScope());
										return 'server';
									}
								}
							}),
							document
						).outcome === 'adopted';
				}
			});
			const node = host.querySelector('i');
			observe({
				case: 'document-report',
				entry,
				accepted,
				text: node?.textContent,
				scopes: scopes.map((s) => s?.active)
			});
			expect(accepted).toBe(true);
			expect(node?.textContent).toBe('server');
			view.dispose();
			expect(scopes[0]?.active).toBe(true);
			render(receipt(DocumentPage, { probe: { value: 'next' } }), host);
			expect(host.querySelector('i')).toBe(node);
			expect(node?.textContent).toBe('next');
		} finally {
			view?.dispose();
			unmount(host);
			document.open();
			document.write(original);
			document.close();
			expect(scopes.every((s) => s && !s.active)).toBe(true);
		}
	});
}

it('does not throw an obsolete public strict mismatch after reporting accepts a newer root', () => {
	const host = document.createElement('div');
	host.innerHTML = '<article>wrong</article>';
	document.body.append(host);
	const scopes: Array<EffectScope | undefined> = [];
	let view: ReturnType<typeof hydrate> | undefined;
	const reentry: { inner: Element | null } = { inner: null };
	try {
		view = hydrate(receipt(Page, { probe: { value: 'outer' } }), host, {
			allowMarkerless: true,
			onMismatch: 'throw',
			onDiagnostic() {
				render(
					receipt(Page, {
						probe: {
							get value() {
								scopes.push(currentEffectScope());
								return 'inner';
							}
						}
					}),
					host
				);
				reentry.inner = host.querySelector('i');
			}
		});
		observe({
			case: 'strict-report-superseded',
			text: host.textContent,
			scopeActive: scopes.map((scope) => scope?.active)
		});
		expect(host.querySelector('i')).toBe(reentry.inner);
		expect(reentry.inner?.textContent).toBe('inner');
		view.dispose();
		expect(scopes[0]?.active).toBe(true);
	} finally {
		view?.dispose();
		unmount(host);
		host.remove();
		expect(scopes.every((scope) => scope && !scope.active)).toBe(true);
	}
});
