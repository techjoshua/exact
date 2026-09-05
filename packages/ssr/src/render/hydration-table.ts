/** Internal grouped hydration table emitted once per response. */
export type ExactHydrationTable = readonly [
	version: 1,
	groups: readonly (readonly [
		componentName: string,
		propNames: readonly string[],
		rows: readonly (readonly [boundaryId: string, ...values: unknown[]])[]
	])[]
];

type MutableGroup = [string, readonly string[], Array<[string, ...unknown[]]>];

type FiniteBoundarySchema = Readonly<{
	name: string;
	propNames: readonly string[];
}>;

type FiniteBoundarySchemaVariants = {
	readonly name: string;
	withChildren?: FiniteBoundarySchema;
	withoutChildren?: FiniteBoundarySchema;
};

// A compiler-finite boundary ID owns fixed authored props and at most two shapes:
// a conditional server child range can add or omit `children`. These maps retain
// only that bounded immutable schema data.
const schemasByBoundaryId = new Map<string, FiniteBoundarySchemaVariants>();
const schemasBySignature = new Map<string, FiniteBoundarySchema>();

function finiteBoundarySchema(
	name: string,
	id: string,
	props: Record<string, unknown>
): FiniteBoundarySchema {
	let variants = schemasByBoundaryId.get(id);
	if (variants) {
		if (variants.name !== name)
			throw new TypeError('A finite client boundary ID cannot identify multiple components');
	} else {
		variants = { name };
		schemasByBoundaryId.set(id, variants);
	}
	const variant = Object.hasOwn(props, 'children') ? 'withChildren' : 'withoutChildren';
	const cached = variants[variant];
	if (cached) return cached;
	const propNames = Object.freeze(Object.keys(props).sort());
	const signature = `${name}\0${propNames.join('\0')}`;
	let schema = schemasBySignature.get(signature);
	if (!schema) {
		schema = Object.freeze({ name, propNames });
		schemasBySignature.set(signature, schema);
	}
	variants[variant] = schema;
	return schema;
}

/** Groups finite compiler-owned client-boundary props by component and schema. */
export class SsrHydrationTable {
	private readonly groups: MutableGroup[] = [];
	private readonly indices = new Map<FiniteBoundarySchema, number>();

	/** Adds one finite boundary and returns its response-local base-36 coordinate. */
	add(name: string, id: string, props: Record<string, unknown>): string {
		const schema = finiteBoundarySchema(name, id, props);
		let groupIndex = this.indices.get(schema);
		if (groupIndex === undefined) {
			groupIndex = this.groups.length;
			this.indices.set(schema, groupIndex);
			this.groups.push([schema.name, schema.propNames, []]);
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
