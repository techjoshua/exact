/** Public DOM renderer facade. */
export { HTML_NAMESPACE, MATHML_NAMESPACE, SVG_NAMESPACE, namespaceForTag } from './namespace.js';
export { applyDomProp, synchronizeFormBinding } from './props.js';
export { findNodeOwnerInstance } from './ownership.js';
export {
	createExactDomInspectionHost,
	type ExactDomInspectionHost,
	type ExactDomInspectionSnapshot
} from './inspection.js';
export {
	exactDomInspectionOwner,
	setExactDomInspectionOwner,
	setExactDomInspectionOwnerFactory
} from './state.js';
export { dispose, disposeOwnedSubtree, unmount } from './renderer/root-disposal.js';
export { findComponentDomNode } from './renderer/component-node.js';
export { renderCompiledComponentRoot as render } from './framework/component-root.js';
export {
	deg,
	em,
	fr,
	ms,
	percent,
	px,
	rad,
	rem,
	s,
	turn,
	vh,
	vmax,
	vmin,
	vw,
	type CssValue
} from './style.js';
export type { DomProfileEvent, RenderOptions } from './types.js';
export {
	DEFAULT_DOM_WORK_LIMIT,
	DomTraversalLimitError,
	consumeDomWork,
	createDomWorkBudget,
	reserveDomWork,
	walkDomSubtree,
	type DomWorkBudget
} from './work.js';
