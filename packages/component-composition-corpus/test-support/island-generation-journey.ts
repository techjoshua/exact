import type { AnyComponentFunction } from '@exactjs/core';

type Api = Pick<typeof import('@exactjs/hydrate'), 'hydrateClientIslands' | 'lazyClientIsland'> & {
	component: AnyComponentFunction;
	targetId: string;
	observe(callback: () => void): void;
	unmount(container: Element): void;
};

/** Keeps a replacement generation interactive while sharing its predecessor's pending module load. */
export async function verifyIslandGenerationReplay(api: Api, document: Document): Promise<void> {
	for (const refresh of [false, true]) {
		const root = document.createElement('main');
		root.innerHTML = `<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="${api.targetId}">Count</button></div>`;
		const boundary = root.firstElementChild!;
		const button = root.querySelector('button')!;
		const controller = new AbortController();
		let resolve!: (component: AnyComponentFunction) => void;
		const loaded = new Promise<AnyComponentFunction>((done) => {
			resolve = done;
		});
		let calls = 0;
		let loads = 0;
		const registry = {
			Counter: api.lazyClientIsland(
				() => {
					loads++;
					return loaded;
				},
				{
					mode: 'interaction',
					reasons: [],
					targets: [{ id: api.targetId, events: [{ type: 'click', replay: 'native-click' }] }]
				}
			)
		};
		const click = () =>
			button.dispatchEvent(
				new document.defaultView!.MouseEvent('click', { bubbles: true, cancelable: true })
			);
		api.observe(() => {
			calls++;
		});
		try {
			api.hydrateClientIslands(root, registry, { signal: controller.signal });
			click();
			boundary.setAttribute('data-exact-client-generation', '2');
			if (refresh) api.hydrateClientIslands(root, registry, { signal: controller.signal });
			click();
			resolve(api.component);
			await new Promise((done) => setTimeout(done, 0));
			if (
				calls !== 1 ||
				boundary.getAttribute('data-exact-client-hydrated') !== 'true' ||
				root.querySelector('button') !== button
			)
				throw new Error(
					'Replacement generation lost its first interaction or retained target identity'
				);
			click();
			if (Number(calls) !== 2 || loads !== 1)
				throw new Error(
					'Following interaction failed or a generation duplicated its shared module load'
				);
		} finally {
			controller.abort();
			api.unmount(boundary);
			api.observe(() => {});
		}
	}
}

type BrokerApi = Pick<
	typeof import('../../hydrate/src/islands/interaction.js'),
	'ensureInteractionHydration' | 'disposeInteractionHydration'
>;

/** Rejects initially retired capture owners, releases replaced owners, and permits a fresh owner. */
export function verifyRetiredInteractionBroker(api: BrokerApi, document: Document): void {
	for (const replace of [false, true]) {
		const root = document.createElement('main');
		root.innerHTML =
			'<div data-exact-client-boundary="one" data-exact-client-hydration="interaction"><button>Go</button></div>';
		const button = root.querySelector('button')!;
		let calls = 0;
		const activate = () => {
			calls++;
			return false;
		};
		const policy = () => ({ type: 'click' as const, replay: 'native-click' as const });
		const previous = new AbortController();
		const retired = new AbortController();
		retired.abort(null);
		const next = new AbortController();
		try {
			if (replace)
				api.ensureInteractionHydration(root, activate, ['click'], policy, {
					signal: previous.signal
				});
			api.ensureInteractionHydration(root, activate, ['click'], policy, { signal: retired.signal });
			button.click();
			if (calls !== 0) throw new Error('Initially aborted interaction owner activated work');
			api.ensureInteractionHydration(root, activate, ['click'], policy, { signal: next.signal });
			button.click();
			if (Number(calls) !== 1)
				throw new Error('Fresh capture owner could not activate independently');
			next.abort();
			button.click();
			if (Number(calls) !== 1) throw new Error('Retired capture owner continued activating work');
		} finally {
			previous.abort();
			next.abort();
			api.disposeInteractionHydration(root);
		}
	}
}
