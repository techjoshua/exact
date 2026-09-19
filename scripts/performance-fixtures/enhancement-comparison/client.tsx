import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { owners, population, type ComparisonKind } from './components.js';

/** Measures completed DOM work and checks equivalent output and retained receiving instances. */
export function measureClient(kind: ComparisonKind, count: number, updates: number) {
	const container = document.createElement('div');
	owners.length = 0;
	try {
		const start = performance.now();
		let failure: unknown;
		render(population(kind, count), container, {
			onErrorReport: (report) => {
				failure ??= report.error;
			}
		});
		if (failure) throw failure;
		const mountMs = performance.now() - start;
		const hosts = [...container.querySelectorAll('span')];
		if (hosts.length !== (kind === 'plain' || kind === 'intl' ? 0 : count))
			throw new Error('Incorrect host count');
		if (owners.length !== count) throw new Error('Incorrect receiver count');
		if (hosts.some((host) => host.title !== 'measured'))
			throw new Error('Missing target contribution');
		const updateStart = performance.now();
		for (let value = 1; value <= updates; value++) {
			for (const owner of owners) owner.state.value = value;
			flushSync();
		}
		const updatesMs = performance.now() - updateStart;
		if (container.textContent !== String(updates).repeat(count))
			throw new Error('Incorrect updated text');
		const updated = container.querySelectorAll('span');
		if (owners.length !== count || hosts.some((host, index) => host !== updated[index]))
			throw new Error('Update replaced an owner or host');
		return { mountMs, updatesMs, hosts: hosts.length };
	} finally {
		unmount(container);
		owners.length = 0;
	}
}

/** Times hydration and records identity loss so replacement work is visible in the comparison. */
export function measureHydration(
	kind: ComparisonKind,
	count: number,
	output: { html: string; resumptions: NonNullable<Parameters<typeof hydrate>[2]>['resumptions'] }
) {
	const container = document.createElement('div');
	container.innerHTML = output.html;
	const elements = [...container.querySelectorAll('*')];
	owners.length = 0;
	try {
		const start = performance.now();
		hydrate(population(kind, count), container, {
			resumptions: output.resumptions,
			onMismatch: 'throw'
		});
		const hydrationMs = performance.now() - start;
		const adopted = container.querySelectorAll('*');
		if (elements.length !== adopted.length || container.textContent !== '0'.repeat(count))
			throw new Error('Incorrect hydration');
		return {
			hydrationMs,
			replacedElements: elements.filter((node, index) => node !== adopted[index]).length,
			hydrationOwners: owners.length
		};
	} finally {
		unmount(container);
		owners.length = 0;
	}
}
