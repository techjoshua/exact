/** Compiler-selected direct render-program binding operations. */
export {
	bindCompiledProgramChild,
	bindCompiledProgramLists,
	bindCompiledProgramProperties,
	bindCompiledProgramText
} from '../renderer/render-program-bindings.js';

/** Compiler-selected direct render-program claim operations. */
export {
	beginCompiledProgramClaims,
	claimCompiledProgramChild,
	claimCompiledProgramElement,
	claimCompiledProgramText,
	enterCompiledProgramElement,
	leaveCompiledProgramElement
} from '../renderer/render-program-claims.js';
