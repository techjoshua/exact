import type { JSX as ExactJSX } from '@exactjs/jsx/jsx-runtime';

declare global {
	/** Compiler-only target projection used by enhancement fixtures before exactc lowering. */
	const _target: (props: ExactJSX.IntrinsicElements['_target']) => ExactJSX.Element;
}

export {};
