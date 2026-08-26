/** Compiler-selected direct render-program binding operations. */
export {
	applyCompiledProgramChild,
	applyCompiledProgramProperties,
	applyCompiledProgramText,
	bindCompiledProgramChild,
	bindCompiledProgramKeyedChild,
	bindCompiledProgramLists,
	bindCompiledProgramProperties,
	bindCompiledProgramText
} from '../renderer/render-program-bindings.js';

/** Compiler-selected component-wide dirty update binding. */
export { bindCompiledComponentUpdate } from '../renderer/component-update-binding.js';
/** Compiler-selected wide component dirty update binding. */
export { bindCompiledWideComponentUpdate } from '../renderer/component-update-wide-binding.js';

/** Compiler-selected direct render-program claim operations. */
export {
	beginCompiledProgramClaims,
	claimCompiledProgramChild,
	claimCompiledProgramKeyedChild,
	claimCompiledProgramElement,
	claimCompiledProgramElementPath,
	claimCompiledProgramProperty,
	claimCompiledProgramText,
	enterCompiledProgramElement,
	leaveCompiledProgramElement
} from '../renderer/render-program-claims.js';
