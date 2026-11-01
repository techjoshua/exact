/** @vitest-environment jsdom */
import { appendFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { createPreparedServerComponentInputReference as serverReceipt } from '@exactjs/core/framework/server-render-structure';
import { currentEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { render, unmount } from '@exactjs/dom';
import { findElementOwner } from '@exactjs/dom/testing';
import { renderToString } from '@exactjs/ssr';
import { hydrateCompiledComponentInputRoot } from './framework/component-root.js';
import { hydrate } from './index.js';
import { ChildInputDocument } from '../../component-composition-corpus/test-support/component-child-input.fixtures.js';
import { OccurrenceForwarding as ChildInputOwner } from '../../component-composition-corpus/test-support/component-child-input-forwarding.fixtures.js';
import { ChildInputDocument as ServerDocument } from '../../component-composition-corpus/test-support/component-child-input.fixtures.js?exact-target=server';
import { OccurrenceForwarding as ServerOwner } from '../../component-composition-corpus/test-support/component-child-input-forwarding.fixtures.js?exact-target=server';

/** Optional owning-run capture records actual values before contract assertions. */
function observe(value: unknown): void {
	const file = process.env.EXACT_CHILD_INPUT_OBSERVATIONS;
	if (file) appendFileSync(file, JSON.stringify(value) + '\n');
}
const entries = [
	['compiled', hydrateCompiledComponentInputRoot],
	['public', hydrate]
] as const;
for (const [name, hydrateRoot] of entries) {
	for (const markers of [false, true]) {
		for (const outerThrows of [false, true]) {
			it(`preserves a newer ${name} root with markers=${markers}, outer throw=${outerThrows}`, async () => {
				const host = document.createElement('div');
				host.innerHTML = (
					await renderToString(serverReceipt(ServerOwner, { probe: { value: 'initial' } }), {
						markers
					})
				).html;
				document.body.append(host);
				const scopes: Array<EffectScope | undefined> = [],
					reports: unknown[] = [],
					diagnostics: unknown[] = [],
					events: unknown[] = [];
				const failure = new Error('obsolete outer acquisition');
				let reads = 0;
				const captured: { inner: Element | null } = { inner: null };
				const operation = receipt(ChildInputOwner, {
					probe: {
						get value() {
							scopes.push(currentEffectScope());
							const ordinal = ++reads;
							if (ordinal === 1) {
								render(operation, host, { onErrorReport: (report) => reports.push(report.error) });
								captured.inner = host.querySelector('i');
								if (outerThrows) throw failure;
							}
							return ordinal === 1 ? 'outer' : 'inner';
						}
					}
				});
				let view: ReturnType<typeof hydrateRoot> | undefined;
				try {
					view = hydrateRoot(operation, host, {
						allowMarkerless: true,
						onMismatch: 'throw',
						onErrorReport: (report) => reports.push(report.error),
						onDiagnostic: (value) => diagnostics.push(value),
						onHydration: (value) => events.push(value)
					});
					const owner = captured.inner && findElementOwner(captured.inner);
					observe({
						case: 'element',
						name,
						markers,
						outerThrows,
						reads,
						html: host.innerHTML,
						sameNode: host.querySelector('i') === captured.inner,
						scopeActive: scopes.map((s) => s?.active),
						reports,
						diagnostics,
						events
					});
					expect(host.querySelector('i')).toBe(captured.inner);
					expect(captured.inner?.textContent).toBe('inner');
					expect(reads).toBe(2);
					expect(scopes[0]?.active).toBe(false);
					expect(scopes[1]?.active).toBe(true);
					expect(reports).toEqual([]);
					expect(diagnostics).toEqual([]);
					expect(events).toEqual([]);
					expect(host.hasAttribute('data-exact-hydrated')).toBe(false);
					// This obsolete hydration handle owns its client resources, not the newer renderer.
					view.dispose();
					expect(host.querySelector('i')).toBe(captured.inner);
					expect(scopes[1]?.active).toBe(true);
					render(receipt(ChildInputOwner, { probe: { value: 'next' } }), host);
					expect(host.querySelector('i')).toBe(captured.inner);
					expect(captured.inner?.textContent).toBe('next');
					expect(captured.inner && findElementOwner(captured.inner)).toBe(owner);
				} finally {
					view?.dispose();
					unmount(host);
					host.remove();
				}
				expect(scopes.every((scope) => scope && !scope.active)).toBe(true);
			});
		}
	}
	it(`disposes the accepted ${name} owner after an ordinary hydration update`, async () => {
		const host = document.createElement('div');
		host.innerHTML = (
			await renderToString(serverReceipt(ServerOwner, { probe: { value: 'initial' } }))
		).html;
		const reports: unknown[] = [];
		const initial = host.querySelector('i');
		const view = hydrateRoot(receipt(ChildInputOwner, { probe: { value: 'initial' } }), host, {
			onMismatch: 'throw',
			onErrorReport: (r) => reports.push(r.error)
		});
		try {
			expect(host.querySelector('i')).toBe(initial);
			expect(hydrateRoot(receipt(ChildInputOwner, { probe: { value: 'updated' } }), host)).toBe(
				view
			);
			expect(host.querySelector('i')).toBe(initial);
			expect(initial?.textContent).toBe('updated');
			expect(reports).toEqual([]);
		} finally {
			view.dispose();
			unmount(host);
		}
		expect(host.childNodes).toHaveLength(0);
	});

	it.each(['retained', 'failed-receive', 'replacement', 'unmounted'] as const)(
		`keeps ${name} disposal tied to its committed mount: %s`,
		async (mode) => {
			const hosts = [document.createElement('div'), document.createElement('div')];
			const scopes: Array<EffectScope | undefined> = [],
				views: Array<ReturnType<typeof hydrateRoot>> = [];
			const reports: unknown[] = [];
			const operation = (value: string, key = 'accepted') =>
				receipt(ChildInputOwner, {
					key,
					probe: {
						get value() {
							scopes.push(currentEffectScope());
							return value;
						}
					}
				});
			try {
				for (const host of hosts) {
					host.innerHTML = (
						await renderToString(
							serverReceipt(ServerOwner, { key: 'accepted', probe: { value: 'initial' } })
						)
					).html;
					views.push(
						hydrateRoot(operation('initial'), host, {
							onMismatch: 'throw',
							onErrorReport: (r) => reports.push(r.error)
						})
					);
				}
				const first = hosts[0]!,
					second = hosts[1]!,
					initial = first.querySelector('i'),
					other = second.querySelector('i');
				if (mode === 'failed-receive') {
					const failure = new Error('rejected retained input');
					expect(() =>
						hydrateRoot(
							receipt(ChildInputOwner, {
								key: 'accepted',
								probe: {
									get value() {
										throw failure;
									}
								}
							}),
							first
						)
					).toThrow(failure);
				}
				if (mode === 'unmounted') unmount(first);
				render(
					operation(
						'next',
						mode === 'retained' || mode === 'failed-receive' ? 'accepted' : 'replacement'
					),
					first
				);
				const next = first.querySelector('i'),
					owner = next && findElementOwner(next);
				expect(next?.textContent).toBe('next');
				if (mode === 'retained' || mode === 'failed-receive') expect(next).toBe(initial);
				else expect(next).not.toBe(initial);
				views[0]!.dispose();
				observe({
					case: 'committed-lifetime-dispose',
					name,
					mode,
					html: first.innerHTML,
					nextActive: owner?.scope.active,
					otherActive: other && findElementOwner(other)?.scope.active,
					reports
				});
				if (mode === 'retained' || mode === 'failed-receive') {
					expect(first.childNodes).toHaveLength(0);
					expect(owner?.scope.active).toBe(false);
				} else {
					expect(first.querySelector('i')).toBe(next);
					expect(owner?.scope.active).toBe(true);
					render(operation('last', 'replacement'), first);
					expect(next?.textContent).toBe('last');
				}
				expect(second.querySelector('i')).toBe(other);
				expect(other && findElementOwner(other)?.scope.active).toBe(true);
				views[1]!.dispose();
				expect(second.childNodes).toHaveLength(0);
				expect(reports).toEqual([]);
			} finally {
				for (const view of views) view.dispose();
				for (const host of hosts) unmount(host);
			}
			expect(scopes.every((s) => s && !s.active)).toBe(true);
		}
	);

	it(`keeps the existing ${name} true-mismatch policy`, () => {
		const host = document.createElement('div');
		host.innerHTML = '<article>wrong</article>';
		const diagnostics: unknown[] = [];
		const invoke = () =>
			hydrateRoot(receipt(ChildInputOwner, { probe: { value: 'initial' } }), host, {
				allowMarkerless: true,
				onMismatch: 'throw',
				onDiagnostic: (d) => diagnostics.push(d)
			});
		if (name === 'public') expect(invoke).toThrow();
		else {
			const view = invoke();
			expect(host.querySelector('i')?.textContent).toBe('initial');
			view.dispose();
		}
		expect(diagnostics.length).toBeGreaterThan(0);
		unmount(host);
	});
	it.each([
		{ reenter: false, outerThrows: false },
		{ reenter: true, outerThrows: false },
		{ reenter: true, outerThrows: true }
	])(`keeps ${name} document ownership with %j`, async ({ reenter, outerThrows }) => {
		const original = document.documentElement.outerHTML;
		const output = await renderToString(
			serverReceipt(ServerDocument, { probe: { value: 'initial' } })
		);
		document.open();
		document.write(output.html);
		document.close();
		const host = document.documentElement,
			scopes: Array<EffectScope | undefined> = [],
			diagnostics: unknown[] = [];
		const captured: { inner: Element | null } = { inner: null };
		let reads = 0,
			innerOwner: ReturnType<typeof findElementOwner> = undefined;
		const operation = receipt(ChildInputDocument, {
			probe: {
				get value() {
					scopes.push(currentEffectScope());
					const ordinal = ++reads;
					if (reenter && ordinal === 1) {
						try {
							render(operation, host);
						} catch (error) {
							observe({
								case: 'document-inner-error',
								name,
								reenter,
								error: String(error),
								stack: (error as Error).stack,
								reads,
								scopeActive: scopes.map((s) => s?.active)
							});
							throw error;
						}
						captured.inner = host.querySelector('i');
						innerOwner = captured.inner ? findElementOwner(captured.inner) : undefined;
						if (outerThrows) throw new Error('obsolete document acquisition');
					}
					return reenter ? (ordinal === 1 ? 'outer' : 'inner') : 'initial';
				}
			}
		});
		let view: ReturnType<typeof hydrateRoot> | undefined;
		try {
			view = hydrateRoot(operation, document, {
				onMismatch: 'throw',
				onDiagnostic: (d) => diagnostics.push(d)
			});
			observe({
				case: 'document',
				outerThrows,
				name,
				reenter,
				reads,
				html: host.outerHTML,
				innerConnected: captured.inner?.isConnected,
				sameNode: host.querySelector('i') === captured.inner,
				scopeActive: scopes.map((s) => s?.active),
				diagnostics
			});
			if (reenter) expect(host.querySelector('i')).toBe(captured.inner);
			expect(host.querySelector('i')?.textContent).toBe(reenter ? 'inner' : 'initial');
			expect(reads).toBe(reenter ? 2 : 1);
			expect(diagnostics).toEqual([]);
			view.dispose();
			if (reenter) {
				expect(scopes[1]?.active).toBe(true);
				expect(innerOwner).toBeDefined();
				expect(captured.inner && findElementOwner(captured.inner)).toBe(innerOwner);
				render(receipt(ChildInputDocument, { probe: { value: 'next' } }), host);
				observe({
					case: 'document-next',
					name,
					sameNode: host.querySelector('i') === captured.inner,
					sameOwner: !!captured.inner && findElementOwner(captured.inner) === innerOwner,
					text: captured.inner?.textContent,
					scopeActive: scopes.map((s) => s?.active)
				});
				expect(host.querySelector('i')).toBe(captured.inner);
				expect(captured.inner?.textContent).toBe('next');
				expect(captured.inner && findElementOwner(captured.inner)).toBe(innerOwner);
			} else expect(scopes[0]?.active).toBe(false);
		} finally {
			view?.dispose();
			unmount(host);
			document.open();
			document.write(original);
			document.close();
		}
		expect(scopes.every((scope) => scope && !scope.active)).toBe(true);
	});
	it('keeps ordinary ' + name + ' document hydration strict', async () => {
		const original = document.documentElement.outerHTML;
		const output = await renderToString(
			serverReceipt(ServerDocument, { probe: { value: 'server' } })
		);
		document.open();
		document.write(output.html);
		document.close();
		const host = document.documentElement,
			node = host.querySelector('i');
		try {
			expect(() =>
				hydrateRoot(receipt(ChildInputDocument, { probe: { value: 'different' } }), document, {
					onMismatch: 'throw'
				})
			).toThrow();
			observe({
				case: 'strict-document-mismatch',
				name,
				text: node?.textContent,
				sameNode: host.querySelector('i') === node
			});
			expect(host.querySelector('i')).toBe(node);
			expect(node?.textContent).toBe('server');
		} finally {
			unmount(host);
			document.open();
			document.write(original);
			document.close();
		}
	});
}
