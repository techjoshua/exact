/** Verifies ordinary writable aliases without weakening field snapshots or numeric checks. */
export function verifyGravityReadonlyValues({
	uniformGravity,
	defineGravityField,
	defineGravityAttractor,
	sampleGravity
}) {
	const point = { position: { x: 0, y: 0 }, time: 0, mass: 1 };
	const field = uniformGravity({ x: 1, y: 2 });
	const result = field.accelerationAt(point);
	result.x = 9;
	check(result.x === 9, 'sample alias');
	check(field.accelerationAt(point).x === 1, 'sample independence');
	const samples = sampleGravity(field, [point]);
	samples[0].y = 8;
	samples.push({ x: 0, y: 0 });
	check(samples.length === 2 && samples[0].y === 8, 'sample collection aliases');
	field.name = 'updated';
	field.accelerationAt = () => ({ x: 3, y: 4 });
	check(field.name === 'updated' && field.accelerationAt(point).x === 3, 'field aliases');
	const nested = { label: 'before' };
	const custom = defineGravityField('custom', () => ({ x: 0, y: 0 }), { parameters: { nested } });
	nested.label = 'after';
	custom.parameters.extra = true;
	check(
		custom.parameters.nested === nested && nested.label === 'after' && custom.parameters.extra,
		'metadata aliases'
	);
	const input = { strength: 100, softening: 1 };
	const definition = defineGravityAttractor(input);
	input.strength = 200;
	check(definition.strength === 100, 'prepared input copy');
	definition.strength = 300;
	check(definition.strength === 300, 'attractor alias');
	let reads = 0;
	const captured = defineGravityAttractor({
		get strength() {
			return ++reads === 1 ? 100 : Number.NaN;
		},
		softening: 1
	});
	check(captured.strength === 100 && reads === 1, 'validated attractor snapshot');
	let rejected = false;
	try {
		uniformGravity({ x: Number.NaN, y: 0 });
	} catch {
		rejected = true;
	}
	check(rejected, 'numeric validation');
	return true;
}

function check(condition, contract) {
	if (!condition) throw new Error(`Gravity readonly contract failed: ${contract}`);
}
