/** Checks native data descriptors through general and compiler-selected reactive providers. */
export function verifyNativeDescriptorAcceptance(api: {
	reactive: typeof import('../../reactive/src/index.js').reactive;
	reactiveObjects: typeof import('../../reactive/src/framework/objects.js').reactiveObjects;
	writeReactiveLazy: typeof import('../../reactive/src/framework/runtime.js').writeReactiveLazy;
}): void;
/** Checks indexed native mutation acceptance and publication ownership. */
export function verifyIndexedDescriptorAcceptance(
	api: Pick<
		typeof import('../../reactive/src/index.js'),
		'indexedReactive' | 'readReactiveOwnProperty' | 'watch' | 'flushSync' | 'batch'
	> &
		Pick<
			typeof import('../../reactive/src/framework/runtime.js'),
			'writeIndexedReactiveValue' | 'deleteIndexedReactiveValue' | 'readIndexedReactiveSource'
		>
): void;

/** Checks native synchronization failures alongside unchanged values and legal nested merges. */
export function verifyReconciliationNativeAcceptance(
	api: Pick<
		typeof import('../../reactive/src/index.js'),
		'reactive' | 'indexedReactive' | 'updateReactive'
	> &
		Pick<typeof import('../../reactive/src/framework/runtime.js'), 'updateReactiveShallow'> & {
			reactiveObjects: typeof import('../../reactive/src/framework/objects.js').reactiveObjects;
			indexedReactiveObjects: typeof import('../../reactive/src/framework/indexed-objects.js').indexedReactiveObjects;
		}
): void;

/** Checks reflected field updates, membership, enumeration, rollback and cleanup. */
export function verifyReactiveReflection(
	api: Pick<
		typeof import('../../reactive/src/index.js'),
		'reactive' | 'indexedReactive' | 'watch' | 'flushSync' | 'batch'
	> & {
		reactiveObjects: typeof import('../../reactive/src/framework/objects.js').reactiveObjects;
		indexedReactiveObjects: typeof import('../../reactive/src/framework/indexed-objects.js').indexedReactiveObjects;
	}
): void;

/** Checks field-reader rebinding through native and raw custom Array methods. */
export function verifyCustomArrayReferenceReplacement(
	api: Pick<typeof import('../../reactive/src/index.js'), 'reactive' | 'watch' | 'flushSync'> & {
		reactiveObjects: typeof import('../../reactive/src/framework/objects.js').reactiveObjects;
	}
): void;
