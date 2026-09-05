/** Opaque JSON-compatible value retained without positional transformation. */
export type ExactValueSerializationLeaf = 0;

/** Immutable component-local schema for finite objects and homogeneous arrays. */
export type ExactValueSerializationSchema =
	| ExactValueSerializationLeaf
	| readonly [1, ...(string | ExactValueSerializationSchema)[]]
	| readonly [2, ExactValueSerializationSchema];

/** Validates bounded immutable positional metadata before an artifact gains runtime authority. */
export function isExactValueSerializationSchema(value: unknown, depth = 0): boolean {
	if (value === 0) return true;
	if (depth > 32 || !Array.isArray(value)) return false;
	if (value[0] === 2)
		return value.length === 2 && isExactValueSerializationSchema(value[1], depth + 1);
	if (value[0] !== 1 || value.length < 3 || value.length % 2 === 0) return false;
	const fields = new Set<string>();
	for (let index = 1; index < value.length; index += 2) {
		const field = value[index];
		if (typeof field !== 'string' || !field || fields.has(field)) return false;
		fields.add(field);
		if (!isExactValueSerializationSchema(value[index + 1], depth + 1)) return false;
	}
	return true;
}

/** Reconstructs one authored plain value from its validated component-local positional payload. */
export function decodeExactValueWithSchema(
	value: unknown,
	schema: ExactValueSerializationSchema
): unknown {
	if (schema === 0) return value;
	if (!Array.isArray(value)) throw new TypeError('Malformed positional eXact component value');
	if (schema[0] === 2) return value.map((item) => decodeExactValueWithSchema(item, schema[1]));
	const fieldCount = (schema.length - 1) / 2;
	if (value.length !== fieldCount)
		throw new TypeError('Malformed positional eXact component value');
	const output: Record<string, unknown> = {};
	for (let schemaIndex = 1, inputIndex = 0; schemaIndex < schema.length; schemaIndex += 2)
		output[schema[schemaIndex] as string] = decodeExactValueWithSchema(
			value[inputIndex++],
			schema[schemaIndex + 1] as ExactValueSerializationSchema
		);
	return output;
}
