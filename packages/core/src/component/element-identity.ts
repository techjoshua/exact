import type { RefBinding } from './contracts.js';

type ElementIdentity = {
	id: string;
	generated: boolean;
};

const identities = new WeakMap<RefBinding<unknown>, ElementIdentity>();
const idToken = /^[^\t\n\f\r ]+$/u;
type ElementIdentityTarget = { id: string };

/** Returns a relationship-safe permanent ID for an already materialized element. */
export function ensureElementId(element: ElementIdentityTarget): string {
	const authored = validElementId(element.id);
	if (authored) return authored;
	if (element.id) throw new TypeError('Element IDs cannot contain ASCII whitespace');
	const platformCrypto = (globalThis as { crypto?: { randomUUID(): string } }).crypto;
	if (!platformCrypto?.randomUUID)
		throw new Error('Element identity requires the platform crypto.randomUUID() API');
	element.id = `exact-${platformCrypto.randomUUID()}`;
	return element.id;
}

/**
 * Reserves a stable ID token for an element ref before its DOM node necessarily exists.
 * Renderers use the reservation for SSR emission and hydration adoption.
 */
export function reserveElementId<T extends ElementIdentityTarget>(binding: RefBinding<T>): string {
	const current = binding.current;
	if (current) {
		const authored = validElementId(current.id);
		if (authored) {
			identities.set(binding, { id: authored, generated: false });
			return authored;
		}
	}
	const existing = identities.get(binding);
	if (existing) return existing.id;
	const id = ensureElementId({ id: '' });
	identities.set(binding, { id, generated: true });
	return id;
}

/** Returns the currently reserved token without creating one. */
export function reservedElementId(binding: RefBinding<unknown>): string | undefined {
	return identities.get(binding)?.id;
}

/**
 * Associates a live element with its ref identity, preserving a valid authored ID when present.
 * A generated token remains on the element after individual relationships are released.
 */
export function attachElementIdentity(
	binding: RefBinding<unknown>,
	element: ElementIdentityTarget
): void {
	const authored = validElementId(element.id);
	if (authored) {
		identities.set(binding, { id: authored, generated: false });
		return;
	}
	if (element.id) return;
	const reserved = identities.get(binding);
	if (reserved) element.id = reserved.id;
}

/** Adopts an emitted or authored ID for a ref during SSR planning or hydration. */
export function adoptElementId(binding: RefBinding<unknown>, id: unknown): boolean {
	const token = validElementId(id);
	if (!token) return false;
	identities.set(binding, { id: token, generated: false });
	return true;
}

/** Resolves a relationship-safe ID, assigning the reserved token to a connected ref when needed. */
export function resolveElementId<T extends ElementIdentityTarget>(
	binding: RefBinding<T>
): string | undefined {
	const current = binding.current;
	if (current?.id) {
		const authored = validElementId(current.id);
		if (!authored) return undefined;
		identities.set(binding, { id: authored, generated: false });
		return authored;
	}
	const id = reserveElementId(binding);
	if (current) current.id = id;
	return id;
}

function validElementId(value: unknown): string | undefined {
	return typeof value === 'string' && idToken.test(value) ? value : undefined;
}
