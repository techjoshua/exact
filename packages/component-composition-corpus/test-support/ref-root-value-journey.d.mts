/** Dependencies supplied from one owned source or built-package graph. */
export type RefRootValueApi = {
	directSsrRef: typeof import('../../ssr/src/runtime/direct-refs.js').directSsrRef;
	directSsrRefs: typeof import('../../ssr/src/runtime/direct-refs.js').directSsrRefs;
	directSsrRoot: typeof import('../../ssr/src/runtime/direct-refs.js').directSsrRoot;
	createFrameworkFixtureComponentInstance: typeof import('../../core/src/testing.js').createFrameworkFixtureComponentInstance;
	publishComponentRoot: typeof import('../../core/src/component/root-lifecycle.js').publishComponentRoot;
	publishComponentRootRelease: typeof import('../../core/src/component/root-lifecycle.js').publishComponentRootRelease;
	reverseComponentRootRelease: typeof import('../../core/src/component/root-lifecycle.js').reverseComponentRootRelease;
	disposeComponentRoot: typeof import('../../core/src/component/root-lifecycle.js').disposeComponentRoot;
	batch: typeof import('../../reactive/src/index.js').batch;
};
/** Executes writable alias, owner isolation, generation and transaction controls. */
export function verifyRefRootValues(api: RefRootValueApi): true;
