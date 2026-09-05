import type { JSX as ExactJSX } from './jsx-runtime.js';

declare global {
	/** Compiler-only target projection element accepted in raw TSX before exactc lowering. */
	const _target: (props: ExactJSX.IntrinsicElements['_target']) => ExactJSX.Element;
	/** Compiler-only transparent range accepted in raw TSX before exactc lowering. */
	const _: (props: ExactJSX.IntrinsicElements[string]) => ExactJSX.Element;
}

export {};
