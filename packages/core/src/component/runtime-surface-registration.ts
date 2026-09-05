import { CompactComponentInstance } from './compact-instance.js';

type RuntimeSurfaceDescriptors = Readonly<PropertyDescriptorMap>;

function installDescriptors(descriptors: RuntimeSurfaceDescriptors): void {
	const target = CompactComponentInstance.prototype;
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
	installDescriptors(descriptors);
}
