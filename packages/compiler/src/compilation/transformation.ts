import { defaultNativeCompilerSession } from '../expression/session.js';
import { transformSourceWithNativeCompiler } from '../native/transformation.js';
import type { TransformOptions, TransformResult } from '../types.js';

/** Transforms eXact TSX/JSX source and returns only the generated code. */
export function transform(source: string, options: TransformOptions = {}): string {
	return transformSource(source, options).code;
}

/** Transforms eXact TSX/JSX source through the native compiler host. */
export function transformSource(source: string, options: TransformOptions = {}): TransformResult {
	const filename = options.filename ?? 'input.tsx';
	const session = options.session ?? defaultNativeCompilerSession();
	if (!session.hasNativeCompiler()) {
		throw new Error('eXact compilation requires a native compiler session');
	}
	return transformSourceWithNativeCompiler(source, filename, { ...options, session });
}
