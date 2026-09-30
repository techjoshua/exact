import {
	readPreparedExactClientExecutableComponentContract,
	type ExactPreparedExecutableComponentContract
} from '../component-contracts.js';
import type { ComponentRegistryEntryRuntime } from './contracts.js';
import { loadRegistryEntry, registryEntryFor } from './loading.js';

const contracts = new WeakMap<object, ExactPreparedExecutableComponentContract>();
const entries = new Map<string, Set<WeakRef<ComponentRegistryEntryRuntime>>>();
const released = new FinalizationRegistry<{
	id: string;
	reference: WeakRef<ComponentRegistryEntryRuntime>;
}>(({ id, reference }) => {
	const group = entries.get(id);
	group?.delete(reference);
	if (!group?.size) entries.delete(id);
});

/** Registers compiler-owned client loaders without retaining unloaded application modules. */
export function registerRegistryHydrationEntry(entry: ComponentRegistryEntryRuntime): void {
	if (!entry.load) return;
	const id = readPreparedExactClientExecutableComponentContract(entry.facade).artifact.id;
	const reference = new WeakRef(entry);
	let group = entries.get(id);
	if (!group) entries.set(id, (group = new Set()));
	group.add(reference);
	released.register(entry, { id, reference });
}

/** Loads only registered selections named by SSR markers, including newly discovered nested registries. */
export function prepareRegistryHydration(source: Iterable<string>): Promise<void> | undefined {
	if (!entries.size) return;
	const identities = new Set(source);
	const pending: Promise<unknown>[] = [];
	for (const id of identities)
		for (const reference of entries.get(id) ?? []) {
			const entry = reference.deref();
			if (entry && !entry.resolved) pending.push(loadRegistryEntry(entry));
		}
	if (!pending.length) return;
	return Promise.all(pending).then(() => prepareRegistryHydration(identities));
}

/** Selects an already loaded registry implementation for adoption while retaining facade identity. */
export function registryHydrationContract(
	contract: ExactPreparedExecutableComponentContract
): ExactPreparedExecutableComponentContract {
	const entry = registryEntryFor(contract.artifact.instantiate);
	if (!entry?.load || !entry.resolved) return contract;
	let resolved = contracts.get(contract);
	if (!resolved) {
		const selected = readPreparedExactClientExecutableComponentContract(entry.resolved);
		resolved = Object.freeze({
			...selected,
			artifact: Object.freeze({
				...selected.artifact,
				id: contract.artifact.id,
				capabilities: Object.freeze([...selected.artifact.capabilities, 'registry'] as const)
			})
		});
		contracts.set(contract, resolved);
	}
	return resolved;
}
