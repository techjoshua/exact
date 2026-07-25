/** Provides the canonical exact client component descriptor value. */
export const exactClientComponentDescriptor = Symbol.for('@exactjs/client-component-descriptor');
/** Provides the canonical exact server component descriptor value. */
export const exactServerComponentDescriptor = Symbol.for('@exactjs/server-component-descriptor');

/** Defines the exact component descriptor entry type contract. */
export type ExactComponentDescriptorEntry = readonly [
	id: string,
	runtimeName: string,
	implementation: (...args: any[]) => any
];

/** Runtime-neutral state path used by a generated continuation contract. */
export type ExactContinuationStatePathDescriptor = Readonly<{
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
}>;

/** Private operation contract attached to the component artifact that owns it. */
export type ExactComponentContinuationDescriptor = Readonly<{
	id: string;
	stateReads: readonly ExactContinuationStatePathDescriptor[];
	stateWrites: readonly ExactContinuationStatePathDescriptor[];
	publicContexts: readonly string[];
	serverContexts: readonly string[];
	boundaries: readonly string[];
}>;

/** Defines the exact component descriptor type contract. */
export type ExactComponentDescriptor = readonly [
	version: 2,
	entries: readonly ExactComponentDescriptorEntry[],
	continuations: readonly ExactComponentContinuationDescriptor[]
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
	if (descriptor[0] !== 2 || !Array.isArray(descriptor[1]) || !Array.isArray(descriptor[2])) {
		throw new Error('Unsupported eXact component descriptor');
	}
	return descriptor;
}

/** Composes private continuation contracts from the imported component artifacts. */
export function composeExactContinuationDescriptors(
	components: readonly ((...args: any[]) => any)[],
	target: 'client' | 'server'
): Record<string, ExactComponentContinuationDescriptor> {
	const output: Record<string, ExactComponentContinuationDescriptor> = {};
	for (const component of components) {
		const descriptor = readExactComponentDescriptor(component, target);
		if (!descriptor) continue;
		for (const continuation of descriptor[2]) {
			const previous = output[continuation.id];
			if (previous && !sameContinuation(previous, continuation)) {
				throw new Error(`Conflicting eXact continuation descriptor ${continuation.id}`);
			}
			output[continuation.id] = continuation;
		}
	}
	return output;
}

/** Compares immutable continuation contracts without depending on object identity. */
function sameContinuation(
	left: ExactComponentContinuationDescriptor,
	right: ExactComponentContinuationDescriptor
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
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
