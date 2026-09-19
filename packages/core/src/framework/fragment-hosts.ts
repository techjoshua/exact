/** Prepared contribution facts for one enhancement owner. */
export interface FragmentContribution {
	readonly owner: symbol;
	readonly tag?: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly declaredHostProps?: boolean;
	readonly structuralBarrier?: boolean;
}

/** One retained host, shared only by consecutive compatible contribution owners. */
export interface FragmentPresentationHost {
	readonly identity: symbol;
	readonly tag: string;
	readonly owners: readonly FragmentContribution[];
}

const bookkeeping = new Set(['key', 'children', '__exactEnhancements']);

/** Detects a host contribution without evaluating reactive prop values. */
export function hasFragmentHostProps(props: Readonly<Record<string, unknown>>): boolean {
	return Object.keys(props).some((key) => !bookkeeping.has(key));
}

/**
 * Shared-host lifetime. Requirements latch for each active attachment and hosts retain
 * identity while at least one owner survives. Removing a middle group does not compact other hosts.
 * Tag configuration is static; replacing an owner must use a new opaque owner identity.
 */
export class FragmentPresentationHosts {
	private hosts: readonly FragmentPresentationHost[] = [];
	private readonly requirements = new Map<symbol, string>();

	/** Plans hosts in source order. Does not allocate DOM, execute components, or merge their props. */
	reconcile(owners: readonly FragmentContribution[]): readonly FragmentPresentationHost[] {
		const active = new Set(owners.map((owner) => owner.owner));
		if (active.size !== owners.length) throw new Error('Duplicate fragment contribution owner');
		const requirements = new Map(this.requirements);
		const existing = new Map<symbol, FragmentPresentationHost>();
		for (const host of this.hosts) for (const owner of host.owners) existing.set(owner.owner, host);
		const next: Array<{ identity: symbol; tag: string; owners: FragmentContribution[] }> = [];
		const assigned = new Set<symbol>();
		let barrier = false;
		for (const owner of owners) {
			const tag = owner.tag ?? 'span';
			const requirement = requirements.get(owner.owner);
			if (requirement !== undefined && requirement !== tag)
				throw new Error('Fragment host tag must remain static for an attachment');
			barrier ||= owner.structuralBarrier === true;
			if (
				requirement === undefined &&
				!owner.declaredHostProps &&
				!hasFragmentHostProps(owner.props)
			)
				continue;
			requirements.set(owner.owner, tag);
			const old = existing.get(owner.owner);
			const previous = next.at(-1);
			const canShare =
				!barrier &&
				previous?.tag === tag &&
				(old === undefined || old.identity === previous.identity);
			if (canShare) previous.owners.push(owner);
			else {
				const identity =
					old && !assigned.has(old.identity) ? old.identity : Symbol('fragment host');
				assigned.add(identity);
				next.push({ identity, tag, owners: [owner] });
			}
			barrier = owner.structuralBarrier === true;
		}
		this.requirements.clear();
		for (const [owner, tag] of requirements)
			if (active.has(owner)) this.requirements.set(owner, tag);
		this.hosts = next.map((host) => Object.freeze({ ...host, owners: Object.freeze(host.owners) }));
		return this.hosts;
	}

	/** Releases all retained host requirements when the owning fragment attachment ends. */
	dispose(): void {
		this.hosts = [];
		this.requirements.clear();
	}
}
