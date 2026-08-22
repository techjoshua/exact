/** Compiler-selected direct render-program binding operations. */
export {
	applyCompiledProgramProperties,
	applyCompiledProgramText,
	bindCompiledProgramChild,
	bindCompiledProgramLists,
	bindCompiledProgramProperties,
	bindCompiledProgramText
} from '../renderer/render-program-bindings.js';

/** Compatibility binding for pre-component-ABI generated update programs. */
export { bindCompiledProgramState } from '../renderer/component-update-lanes.js';

/** Compiler-selected component-wide dirty update binding. */
export { bindCompiledComponentUpdate } from '../renderer/component-update-binding.js';

/** Compiler-selected direct render-program claim operations. */
export {
	beginCompiledProgramClaims,
	claimCompiledProgramChild,
	claimCompiledProgramElement,
	claimCompiledProgramElementPath,
	claimCompiledProgramProperty,
	claimCompiledProgramText,
	enterCompiledProgramElement,
	leaveCompiledProgramElement
} from '../renderer/render-program-claims.js';
