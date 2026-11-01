/**
 * Derives a locally owned configuration view, retaining hidden, inherited and virtual configuration fields.
 * Existing enumerable callbacks keep their scoped receiver. Previously omitted methods retain
 * their original owner so class-private configuration state remains usable. Enumerable own getters keep
 * snapshot behavior. Other accessors remain lazy on their owner,
 * and local writable fields allow local overrides even when the input configuration is frozen.
 * Overrides receive the owned copy after enumerable getters have been captured.
 */
export function deriveRuntimeConfiguration<
	Configuration extends object,
	Overrides extends object = object
>(
	configuration: Configuration,
	overrides: (captured: Configuration) => Overrides
): Omit<Configuration, keyof Overrides> & Overrides {
	const copied = { ...configuration };
	// A provider may expose virtual fields through a Proxy. Preserve ordinary lookup for
	// fields outside its own-key inventory, while all derived writes remain local.
	Object.setPrototypeOf(copied, configuration);
	const seen = new WeakSet<object>();
	for (
		let source: object | null = configuration;
		source && source !== Object.prototype;
		source = Object.getPrototypeOf(source)
	) {
		if (seen.has(source)) throw new TypeError('Cyclic runtime configuration prototype');
		seen.add(source);
		for (const key of Reflect.ownKeys(source)) {
			if (key === 'constructor' || Object.hasOwn(copied, key)) continue;
			const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
			const attributes = { enumerable: descriptor.enumerable, configurable: true };
			const read = () =>
				configurationValue(Reflect.get(configuration, key, configuration), configuration);
			Object.defineProperty(
				copied,
				key,
				'value' in descriptor
					? { ...attributes, value: read(), writable: true }
					: {
							...attributes,
							get: read,
							set(value: unknown) {
								Object.defineProperty(copied, key, { ...attributes, value, writable: true });
							}
						}
			);
		}
	}
	return Object.defineProperties(
		copied,
		Object.getOwnPropertyDescriptors(overrides(copied))
	) as unknown as Omit<Configuration, keyof Overrides> & Overrides;
}

/** Invokes previously omitted methods on their original owner without consulting authored bind metadata. */
function configurationValue(value: unknown, configuration: object): unknown {
	return typeof value === 'function'
		? (...args: unknown[]) => Reflect.apply(value, configuration, args)
		: value;
}
