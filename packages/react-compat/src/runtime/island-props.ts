import type { AnyReactComponentType } from '../types.js';

/** Renderer-owned component identity kept separate from every authored string prop. */
export const reactRendererComponent = Symbol('exact.react.renderer-component');

/** Reads renderer identity or the component field supplied by compiler-issued island artifacts. */
export function reactIslandComponent(
	props: Record<string, unknown>
): AnyReactComponentType | symbol {
	return ((props as Record<PropertyKey, unknown>)[reactRendererComponent] ?? props.component) as
		| AnyReactComponentType
		| symbol;
}
