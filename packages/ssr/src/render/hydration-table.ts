/** Internal grouped hydration table emitted once per response. */
export type ExactHydrationTable = readonly [
	version: 1,
	groups: readonly (readonly [
		componentName: string,
		propNames: readonly string[],
		rows: readonly (readonly [boundaryId: string, ...values: unknown[]])[]
	])[]
];

type MutableGroup = [string, string[], Array<[string, ...unknown[]]>];

/** Groups finite compiler-owned client-boundary props by component and schema. */
export class SsrHydrationTable {
	private readonly groups: MutableGroup[] = [];
	private readonly indices = new Map<string, number>();

	/** Adds one finite boundary and returns its response-local base-36 coordinate. */
	add(name: string, id: string, props: Record<string, unknown>): string {
		const names = Object.keys(props).sort();
		const key = `${name}\0${names.join('\0')}`;
		let groupIndex = this.indices.get(key);
		if (groupIndex === undefined) {
			groupIndex = this.groups.length;
			this.indices.set(key, groupIndex);
			this.groups.push([name, names, []]);
		}
		const group = this.groups[groupIndex]!;
		const rowIndex = group[2].length;
		group[2].push([id, ...group[1].map((prop) => props[prop])]);
		return `${groupIndex.toString(36)}.${rowIndex.toString(36)}`;
	}

	/** Returns no payload when the response did not publish compact boundaries. */
	value(): ExactHydrationTable | undefined {
		return this.groups.length ? [1, this.groups] : undefined;
	}
}
