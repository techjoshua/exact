import { defaultNativeCompilerSession } from '../expression/session.js';
import { analyzeSourceWithNativeCompiler } from '../native/transformation.js';
import type { ExactModuleAnalysis, TransformOptions } from '../types.js';

/** Analyzes source into the compiler analysis through the native compiler host. */
export function analyzeSource(source: string, options: TransformOptions = {}): ExactModuleAnalysis {
	const filename = options.filename ?? 'input.tsx';
	const session = options.session ?? defaultNativeCompilerSession();
	if (!session.hasNativeCompiler()) {
		throw new Error('eXact analysis requires a native compiler session');
	}
	return analyzeSourceWithNativeCompiler(source, filename, { ...options, session });
}
