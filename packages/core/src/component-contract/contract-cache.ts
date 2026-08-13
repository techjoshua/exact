import type { ExactComponentContract } from '../component-contracts.js';
import { isExactComponentContract } from './contract-validation.js';

type CachedComponentContract = Readonly<{
	raw: ExactComponentContract;
	componentId: string;
}>;

const validatedContracts = new WeakMap<(...args: any[]) => unknown, CachedComponentContract>();

/** Validates and freezes compiler authority once while detecting later attachment replacement. */
export function validatedComponentContract(
	component: (...args: any[]) => unknown,
	raw: unknown,
	componentId: string
): ExactComponentContract {
	const cached = validatedContracts.get(component);
	if (cached && cached.raw === raw && cached.componentId === componentId) return cached.raw;
	if (!isExactComponentContract(raw, componentId))
		throw new Error('Unsupported eXact component contract');
	freezeContractMetadata(raw);
	validatedContracts.set(component, { raw, componentId });
	return raw;
}

function freezeContractMetadata(contract: ExactComponentContract): void {
	const pending: object[] = [contract];
	const visited = new WeakSet<object>();
	while (pending.length) {
		const value = pending.pop()!;
		if (visited.has(value)) continue;
		visited.add(value);
		for (const key of Reflect.ownKeys(value)) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			const child = descriptor && 'value' in descriptor ? descriptor.value : undefined;
			if (child !== null && typeof child === 'object') pending.push(child);
		}
		Object.freeze(value);
	}
}
