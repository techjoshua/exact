type RuntimeSurfaceDescriptors = Readonly<PropertyDescriptorMap>;

const descriptorGroups: RuntimeSurfaceDescriptors[] = [];
const targets = new Set<object>();

function installDescriptors(target: object, descriptors: RuntimeSurfaceDescriptors): void {
	for (const key of Reflect.ownKeys(descriptors)) {
		if (Object.hasOwn(target, key))
			throw new Error(`Component runtime surface already defines ${String(key)}`);
		Object.defineProperty(target, key, descriptors[key]!);
	}
}

/**
 * Registers one compiler-selectable group of authored component operations.
 *
 * Registration is order-independent: feature entries may evaluate before or after the component
 * implementation that receives them. A duplicate property is an artifact construction error.
 */
export function registerComponentRuntimeSurface(descriptors: RuntimeSurfaceDescriptors): void {
	descriptorGroups.push(descriptors);
	for (const target of targets) installDescriptors(target, descriptors);
}

/** Installs every registered authored surface on one component implementation prototype. */
export function registerComponentRuntimeSurfaceTarget(target: object): void {
	if (targets.has(target)) return;
	for (const descriptors of descriptorGroups) installDescriptors(target, descriptors);
	targets.add(target);
}
