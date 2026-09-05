import { createContext, type Child, type Component } from '@exactjs/core';

const directToken = createContext<string>('@test/native-direct-enhancement-provider');
const fragmentToken = createContext<string>('@test/native-fragment-enhancement-provider');
/** Context identity provided while testing direct render-program ownership. */
export const programEnhancementToken = createContext<string>(
	'@test/direct-program-enhancement-owner'
);

/** Compiler-backed wrapper for an opaque intrinsic operation. */
export function NativeDirectProvider(this: Component<{}>, props: { children?: Child }) {
	this.setContext(directToken, 'provided');
	return () => <div>{props.children}</div>;
}

/** Compiler-backed target contributor for an opaque intrinsic operation. */
export function NativeTargetEnhancement(props: { children?: Child }) {
	return () => <_target className="enhanced">{props.children}</_target>;
}

/** Compiler-backed wrapper for an opaque fragment operation. */
export function NativeFragmentProvider(this: Component<{}>, props: { children?: Child }) {
	this.setContext(fragmentToken, 'provided');
	return () => <section>{props.children}</section>;
}

/** Compiler-backed transparent provider used by render-program ownership coverage. */
export function ProgramEnhancementProvider(this: Component<{}>, props: { children?: Child }) {
	this.setContext(programEnhancementToken, 'provided');
	return () => props.children;
}
