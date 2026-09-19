import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { hydrate } from '@exactjs/hydrate';
import {
	enhancementPopulation,
	receivingOwners,
	enhancementLifecycle
} from './enhancement-components.js';
import type { PopulationKind } from './enhancement-components.js';

/** Measures compiled mounting, unrelated scalar updates, and complete lifetime release. */
export function measureEnhancementPopulation(kind: PopulationKind, count: number, updates: number) {
	const container = document.createElement('div');
	receivingOwners.length = 0;
	enhancementLifecycle.mounted = enhancementLifecycle.disposed = 0;
	const start = performance.now();
	let completed = false;
	try {
		render(enhancementPopulation(kind, count), container);
		const mountedAt = performance.now();
		const hosts = [...container.querySelectorAll('span')];
		if (hosts.length !== (kind === 'plain' || kind === 'intl' ? 0 : count))
			throw new Error(`Unexpected fragment host count for ${kind}: ${hosts.length}`);
		if (receivingOwners.length !== count || enhancementLifecycle.mounted !== count)
			throw new Error('Repeated receiving component construction');
		const updateStart = performance.now();
		for (let revision = 1; revision <= updates; revision++) {
			for (const owner of receivingOwners) owner.state.value = revision;
			flushSync();
		}
		const updatedAt = performance.now();
		if (container.textContent !== String(updates).repeat(count))
			throw new Error('Incorrect scalar update');
		const updatedHosts = container.querySelectorAll('span');
		if (hosts.some((host, index) => updatedHosts[index] !== host))
			throw new Error('Scalar update replaced a presentation host');
		if (enhancementLifecycle.disposed !== 0)
			throw new Error('Scalar update disposed a receiving owner');
		completed = true;
		return { mountMs: mountedAt - start, updatesMs: updatedAt - updateStart, hosts: hosts.length };
	} finally {
		unmount(container);
		if (completed && enhancementLifecycle.disposed !== count)
			throw new Error('Receiving component lifetime leaked');
		receivingOwners.length = 0;
	}
}

/** Measures matching adoption and asserts that every server-created element is retained. */
export function measureEnhancementHydration(
	kind: PopulationKind,
	count: number,
	html: string,
	resumptions: NonNullable<Parameters<typeof hydrate>[2]>['resumptions']
) {
	const container = document.createElement('div');
	container.innerHTML = html;
	const elements = [...container.querySelectorAll('*')];
	receivingOwners.length = 0;
	enhancementLifecycle.mounted = enhancementLifecycle.disposed = 0;
	try {
		const start = performance.now();
		hydrate(enhancementPopulation(kind, count), container, { resumptions, onMismatch: 'throw' });
		const hydrationMs = performance.now() - start;
		const adopted = container.querySelectorAll('*');
		if (
			elements.length !== adopted.length ||
			elements.some((node, index) => node !== adopted[index])
		)
			throw new Error(`Hydration replaced a server element in ${kind}`);
		if (receivingOwners.length !== count)
			throw new Error('Hydration repeated component preparation');
		return { hydrationMs };
	} finally {
		unmount(container);
		receivingOwners.length = 0;
	}
}
