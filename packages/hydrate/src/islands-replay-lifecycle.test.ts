/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, unmount } from '@exactjs/dom/root';
import { appendFileSync } from 'node:fs';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { currentEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { findElementOwner } from '@exactjs/dom/testing';
import {
	IslandInputPage,
	IslandInputProbe,
	observeIslandInput
} from './test-support/islands.fixtures.js';
import { hydrate, hydrateClientIslands, lazyClientIsland } from './index.js';
import { verifyIslandGenerationReplay } from '../../component-composition-corpus/test-support/island-generation-journey.js';
import { observeReplay, ReplayCounter } from './test-support/island-replay.fixtures.js';

import { compiledTargetIdentity } from './test-support/compiled-target-identity.js';

const replayTarget = () => compiledTargetIdentity(ReplayCounter);
const markup = () =>
	`<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="${replayTarget()}">Count</button></div>`;
const release = () => new Promise((resolve) => setTimeout(resolve, 0));
const click = (root: Element) =>
	root
		.querySelector('button')!
		.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

describe.each(['interaction', 'eager'] as const)('%s replay lifecycle', (activationMode) => {
	it.each(['abort', 'generation', 'remove'] as const)(
		'stops queued replay when its first handler causes %s and keeps the shared module usable',
		async (mode) => {
			const root = document.createElement('main');
			root.innerHTML = markup().replace('hydration="interaction"', `hydration="${activationMode}"`);
			const boundary = root.firstElementChild!;
			const controller = new AbortController();
			let resolve!: (value: typeof ReplayCounter) => void;
			const loaded = new Promise<typeof ReplayCounter>((done) => {
				resolve = done;
			});
			let calls = 0;
			let loads = 0;
			const registry = {
				Counter: lazyClientIsland(
					() => {
						loads++;
						return loaded;
					},
					{
						mode: activationMode,
						reasons: [],
						targets: [{ id: replayTarget(), events: [{ type: 'click', replay: 'native-click' }] }]
					}
				)
			};
			observeReplay(() => {
				calls++;
				if (mode === 'abort') controller.abort();
				else if (mode === 'generation') boundary.setAttribute('data-exact-client-generation', '2');
				else boundary.remove();
			});
			try {
				hydrateClientIslands(root, registry, { signal: controller.signal });
				click(root);
				click(root);
				resolve(ReplayCounter);
				await release();
				expect(calls).toBe(1);
			} finally {
				controller.abort();
				unmount(boundary);
				observeReplay(() => {});
			}
			root.innerHTML = markup().replace('hydration="interaction"', `hydration="${activationMode}"`);
			const nextBoundary = root.firstElementChild!;
			const next = new AbortController();
			observeReplay(() => {
				calls++;
			});
			try {
				hydrateClientIslands(root, registry, { signal: next.signal });
				const button = root.querySelector('button');
				click(root);
				await release();
				expect(calls).toBe(2);
				expect(root.querySelector('button')).toBe(button);
				click(root);
				expect(calls).toBe(3);
				expect(loads).toBe(1);
			} finally {
				next.abort();
				unmount(nextBoundary);
				observeReplay(() => {});
			}
		}
	);
});

it('keeps generation replacement interactive with and without registry refresh', async () => {
	await verifyIslandGenerationReplay(
		{
			hydrateClientIslands,
			lazyClientIsland,
			component: ReplayCounter,
			targetId: replayTarget(),
			observe: observeReplay,
			unmount
		},
		document
	);
});

/** Saves actual lifecycle values before assertions when the owning runner requests evidence. */
function observe(row: unknown): void {
	const file = process.env.EXACT_CHILD_INPUT_OBSERVATIONS;
	if (file) appendFileSync(file, JSON.stringify(row) + '\n');
}

for (const mismatch of [false, true]) {
	it(`public hydrate uses the actual island outcome, mismatch=${mismatch}`, async () => {
		const host = document.createElement('div');
		host.innerHTML =
			'<main><div data-exact-client-boundary="probe" data-exact-client-name="Probe" data-exact-client-hydration="eager">' +
			(mismatch ? '<p>wrong</p>' : '<button>Count0</button>') +
			'</div></main>';
		document.body.append(host);
		const initial = host.querySelector('button'),
			events: unknown[] = [],
			reports: unknown[] = [];
		let scope: EffectScope | undefined,
			reads = 0;
		observeIslandInput(() => {
			reads++;
			scope = currentEffectScope();
		});
		let view: ReturnType<typeof hydrate> | undefined;
		try {
			view = hydrate(receipt(IslandInputPage, {}), host, {
				allowMarkerless: true,
				onMismatch: 'replace',
				islands: { Probe: IslandInputProbe },
				onHydration: (e) => events.push(e),
				onErrorReport: (r) => reports.push(r.error)
			});
			await view.whenSettled();
			const boundary = host.querySelector('[data-exact-client-boundary]')!,
				button = boundary.querySelector('button')!;
			observe({
				case: 'public-island',
				mismatch,
				reads,
				html: host.innerHTML,
				sameNode: button === initial,
				events,
				reports,
				active: scope?.active
			});
			expect(button?.textContent).toBe('Count0');
			expect(events).toContainEqual({
				kind: 'island',
				outcome: mismatch ? 'mounted' : 'adopted',
				component: 'Probe',
				markers: mismatch ? 'none' : 'markerless'
			});
			if (!mismatch) expect(button).toBe(initial);
			expect(reports).toEqual([]);
			button.click();
			expect(button.textContent).toBe('Count1');
			view.dispose();
			observe({
				case: 'public-island-disposed',
				mismatch,
				active: scope?.active,
				html: host.innerHTML
			});
			expect(scope?.active).toBe(false);
			expect(host.childNodes).toHaveLength(0);
		} finally {
			observeIslandInput(() => {});
			view?.dispose();
			unmount(host);
			host.remove();
		}
	});
}

for (const throws of [false, true]) {
	it(`superseded island acquisition preserves the actual newer owner, outer throw=${throws}`, () => {
		const host = document.createElement('main');
		host.innerHTML =
			'<div data-exact-client-boundary="probe" data-exact-client-name="Probe" data-exact-client-hydration="eager"><button>Count0</button></div>';
		document.body.append(host);
		const boundary = host.firstElementChild!,
			reports: unknown[] = [],
			events: unknown[] = [],
			scopes: Array<EffectScope | undefined> = [];
		const failure = new Error('obsolete island read');
		let reads = 0,
			inner: HTMLButtonElement | null = null;
		const operation = receipt(IslandInputProbe, {});
		observeIslandInput(() => {
			scopes.push(currentEffectScope());
			if (++reads === 1) {
				render(operation, boundary);
				inner = boundary.querySelector('button');
				if (throws) throw failure;
			}
		});
		try {
			const count = hydrateClientIslands(
				host,
				{ Probe: IslandInputProbe },
				{ onHydration: (e) => events.push(e), onErrorReport: (r) => reports.push(r.error) }
			);
			observe({
				case: 'superseded-island',
				throws,
				count,
				reads,
				sameNode: boundary.querySelector('button') === inner,
				html: boundary.innerHTML,
				events,
				reports: reports.map((e) => (e === failure ? 'authored failure' : String(e))),
				active: scopes.map((s) => s?.active),
				marked: boundary.hasAttribute('data-exact-client-hydrated')
			});
			expect(count).toBe(0);
			expect(reports).toEqual([]);
			expect(boundary.querySelector('button')).toBe(inner);
			expect(events).toEqual([]);
			expect(boundary.hasAttribute('data-exact-client-hydrated')).toBe(false);
			expect(scopes[0]?.active).toBe(false);
			expect(scopes[1]?.active).toBe(true);
			const accepted = inner as HTMLButtonElement | null;
			const owner = accepted && findElementOwner(accepted);
			accepted?.click();
			expect((inner as HTMLButtonElement | null)?.textContent).toBe('Count1');
			expect(inner && findElementOwner(inner)).toBe(owner);
			unmount(boundary);
			expect(scopes.every((s) => s && !s.active)).toBe(true);
			expect(boundary.childNodes).toHaveLength(0);
		} finally {
			observeIslandInput(() => {});
			unmount(boundary);
			host.remove();
		}
	});
}

it('stops island fallback after an actual disconnected callback accepts a newer root', () => {
	const host = document.createElement('main');
	document.body.append(host);
	const boundary = document.createElement('div');
	boundary.setAttribute('data-exact-client-boundary', 'probe');
	boundary.setAttribute('data-exact-client-name', 'Probe');
	boundary.setAttribute('data-exact-client-hydration', 'eager');
	host.append(boundary);
	const operation = receipt(IslandInputProbe, {}),
		events: unknown[] = [];
	let inner: Element | null = null,
		callback: (() => void) | undefined;
	const name = 'exact-island-disconnect-probe';
	if (!customElements.get(name))
		customElements.define(
			name,
			class extends HTMLElement {
				disconnectedCallback() {
					callback?.();
				}
			}
		);
	const wrong = document.createElement(name);
	boundary.append(wrong);
	callback = () => {
		callback = undefined;
		render(operation, boundary);
		inner = boundary.querySelector('button');
	};
	try {
		const count = hydrateClientIslands(
			host,
			{ Probe: IslandInputProbe },
			{ onHydration: (event) => events.push(event) }
		);
		const accepted = inner as Element | null;
		const owner = accepted && findElementOwner(accepted);
		observe({
			case: 'island-disconnect',
			count,
			html: boundary.innerHTML,
			sameNode: boundary.querySelector('button') === inner,
			active: owner?.scope.active,
			events
		});
		expect(count).toBe(0);
		expect(boundary.querySelector('button')).toBe(inner);
		expect((inner as HTMLButtonElement | null)?.textContent).toBe('Count0');
		expect(owner?.scope.active).toBe(true);
		expect(events).toEqual([]);
		expect(boundary.hasAttribute('data-exact-client-hydrated')).toBe(false);
		(inner as HTMLButtonElement | null)?.click();
		expect((inner as HTMLButtonElement | null)?.textContent).toBe('Count1');
		unmount(boundary);
		expect(owner?.scope.active).toBe(false);
	} finally {
		callback = undefined;
		unmount(boundary);
		host.remove();
	}
});
