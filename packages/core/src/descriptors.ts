/** Provides the canonical exact client component descriptor value. */
export const exactClientComponentDescriptor = Symbol.for('@exact/client-component-descriptor');
/** Provides the canonical exact server component descriptor value. */
export const exactServerComponentDescriptor = Symbol.for('@exact/server-component-descriptor');

/** Defines the exact component descriptor entry type contract. */
export type ExactComponentDescriptorEntry = readonly [
	id: string,
	runtimeName: string,
	implementation: (...args: any[]) => any
];

/** Defines the exact component descriptor type contract. */
export type ExactComponentDescriptor = readonly [
	version: 1,
	entries: readonly ExactComponentDescriptorEntry[]
];

type DescribedComponent = ((...args: any[]) => any) & {
	[exactClientComponentDescriptor]?: ExactComponentDescriptor;
	[exactServerComponentDescriptor]?: ExactComponentDescriptor;
};

/** Reads compiler-attached component metadata without widening public component types. */
export function readExactComponentDescriptor(
	component: (...args: any[]) => unknown,
	target: 'client' | 'server'
): ExactComponentDescriptor | undefined {
	const symbol =
		target === 'client' ? exactClientComponentDescriptor : exactServerComponentDescriptor;
	const descriptor = (component as DescribedComponent)[symbol];
	if (!descriptor) return undefined;
	if (descriptor[0] !== 1 || !Array.isArray(descriptor[1])) {
		throw new Error('Unsupported eXact component descriptor');
	}
	return descriptor;
}

/** Composes descriptors imported by an application entrypoint into a runtime lookup. */
export function composeExactComponentDescriptors(
	components: readonly ((...args: any[]) => any)[],
	target: 'client' | 'server'
): Record<string, (...args: any[]) => any> {
	const output: Record<string, (...args: any[]) => any> = {};
	for (const component of components) {
		const descriptor = readExactComponentDescriptor(component, target);
		if (!descriptor) continue;
		for (const [, runtimeName, implementation] of descriptor[1]) {
			const previous = output[runtimeName];
			if (previous && previous !== implementation) {
				throw new Error(`Conflicting eXact component descriptor ${runtimeName}`);
			}
			output[runtimeName] = implementation;
		}
	}
	return output;
}
