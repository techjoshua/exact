/** DOM representation of the partition discriminator encoded in SSR marker attributes. */
export type ExactDomPartitionDiscriminator =
	| Readonly<{ kind: 'single' }>
	| Readonly<{ kind: 'branch'; branch: string }>
	| Readonly<{ kind: 'keyed'; list: string; keyToken: string }>;

/** Reads and validates the partition discriminator encoded on an SSR marker element. */
export function readExactPartitionDiscriminator(
	marker: Element
): ExactDomPartitionDiscriminator | undefined {
	const kind = marker.getAttribute('data-exact-partition-discriminator');
	if (kind === 'single') return Object.freeze({ kind });
	if (kind === 'branch') {
		const branch = marker.getAttribute('data-exact-partition-branch');
		return branch ? Object.freeze({ kind, branch }) : undefined;
	}
	if (kind === 'keyed') {
		const list = marker.getAttribute('data-exact-partition-list');
		const keyToken = marker.getAttribute('data-exact-partition-key');
		return list && keyToken ? Object.freeze({ kind, list, keyToken }) : undefined;
	}
	return undefined;
}
