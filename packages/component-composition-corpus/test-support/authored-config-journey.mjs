/** Checks caller-owned configuration and opaque plugin callbacks at schema validation. */
export function verifyAuthoredConfigValues({ defineConfig }) {
	const check = (value, message) => {
		if (!value) throw new Error('Authored configuration: ' + message);
	};
	const transform = Object.assign(
		(value) => {
			transform.calls++;
			value.values.push('updated');
		},
		{ calls: 0, cache: { hits: 0 } }
	);
	const config = defineConfig({ plugins: { example: transform }, debug: { runtime: true } });
	check(config.plugins.example === transform, 'callback identity');
	transform({ values: [] });
	transform.cache.hits++;
	config.debug.runtime = false;
	check(
		transform.calls === 1 && transform.cache.hits === 1 && config.debug.runtime === false,
		'ordinary aliases and callback state'
	);
	const opaque = () => undefined;
	Object.defineProperty(opaque, 'metadata', {
		enumerable: true,
		get() {
			throw new Error('Unrequested callback inspection');
		}
	});
	check(
		defineConfig({ plugins: { opaque } }).plugins.opaque === opaque,
		'callback metadata remains opaque'
	);
	let rejected = false;
	try {
		defineConfig({ debug: { runtime: 'invalid' } });
	} catch {
		rejected = true;
	}
	check(rejected, 'built-in validation remains active');
	return true;
}
