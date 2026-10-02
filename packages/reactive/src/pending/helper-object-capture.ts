import { nativePropertyKey } from '../internal/property-key.js';

/** Distinguishes replacement from the native pairing of getters and setters. */
export type PendingHelperObjectMemberKind = 'value' | 'get' | 'set';

type Member = readonly [PropertyKey, PendingHelperObjectMemberKind];
type Selection = Partial<Record<PendingHelperObjectMemberKind, number>>;

/**
 * Records actual computed names and copied keys while native object construction retains
 * descriptors, home objects and evaluation order. Registration consults final ownership without
 * invoking a getter or coercing an authored key a second time. Ordinary statically known objects
 * do not need this capture.
 */
export class PendingReactiveHelperObject {
	private readonly members: (Member | Set<PropertyKey> | undefined)[];
	private ownership?: Map<PropertyKey, Selection>;

	constructor(definitions: readonly (Member | undefined)[]) {
		this.members = [...definitions];
	}

	/** Coerces a dynamic name exactly once at its native construction position. */
	key(index: number, input: unknown, kind: PendingHelperObjectMemberKind): PropertyKey {
		const key = nativePropertyKey(input);
		this.members[index] = [key, kind];
		return key;
	}

	/** Records only keys whose enumerable values the native spread actually consumes. */
	spread<Value>(index: number, source: Value): Value {
		const keys = new Set<PropertyKey>();
		this.members[index] = keys;
		if (source == null) return source;
		const target = Object(source) as object;
		// A separate extensible target avoids extra invariant probes on an authored Proxy.
		// Native spread consumes only keys, enumerability and values from this local facade.
		return new Proxy(Object.create(null) as object, {
			ownKeys: () => Reflect.ownKeys(target),
			getOwnPropertyDescriptor(_target, key) {
				const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
				return descriptor ? { ...descriptor, configurable: true } : undefined;
			},
			get(_target, key) {
				keys.add(key);
				return Reflect.get(target, key, target);
			}
		}) as Value;
	}

	/** Selects surviving authored methods or accessors in linear construction order once. */
	selected(index: number): boolean {
		if (!this.ownership) {
			const ownership = (this.ownership = new Map<PropertyKey, Selection>());
			for (const [position, member] of this.members.entries()) {
				if (!member) continue;
				if (member instanceof Set) {
					for (const key of member) ownership.set(key, { value: position });
					continue;
				}
				const [key, kind] = member;
				const previous = ownership.get(key);
				ownership.set(
					key,
					kind === 'value'
						? { value: position }
						: { ...(previous?.value === undefined ? previous : undefined), [kind]: position }
				);
			}
		}
		const member = this.members[index];
		return Boolean(
			member && !(member instanceof Set) && this.ownership.get(member[0])?.[member[1]] === index
		);
	}

	/** Returns the captured native name after final ownership has selected a member. */
	name(index: number): PropertyKey {
		const member = this.members[index];
		if (!member || member instanceof Set) throw new TypeError('Missing compiled helper member');
		return member[0];
	}
}

/** Creates compiler-local provenance for an object with computed or spread member ownership. */
export function createPendingReactiveHelperObject(
	definitions: readonly (Member | undefined)[]
): PendingReactiveHelperObject {
	return new PendingReactiveHelperObject(definitions);
}
