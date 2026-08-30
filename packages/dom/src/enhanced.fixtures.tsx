import { createEnhancementNode, type Child, type Component } from '@exactjs/core';

function CatalogEnhancedButton(this: Component<{}>, props: { identity: string }) {
	return () => (
		<button __exactEnhancements={createEnhancementNode([{ identity: props.identity, props: {} }])}>
			Save
		</button>
	);
}

/** Creates the compiler-backed component root used to verify the enhanced facade. */
export function createCatalogEnhancedButtonRoot(identity: string) {
	return <CatalogEnhancedButton identity={identity} />;
}

/** Compiler-backed application-catalog enhancement fixture. */
export function CatalogAsideEnhancement(
	this: Component<{}>,
	props: { children?: Child | Child[] }
) {
	return () => <aside>{props.children}</aside>;
}

/** Compiler-backed late capability enhancement fixture. */
export function LateAsideEnhancement(this: Component<{}>, props: { children?: Child | Child[] }) {
	return () => <aside data-late>{props.children}</aside>;
}
