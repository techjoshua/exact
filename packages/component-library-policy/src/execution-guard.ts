import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ExactComponentAuthorizationError } from './contracts.js';

/**
 * Turns a build-time policy denial into a module that rejects execution before its candidate's
 * dependency graph evaluates. Structural/provenance failures remain errors. Generated files live
 * with the application's other .exact build cache and contain no credentials or policy object.
 */
export function materializeExactComponentExecutionGuard(
	error: unknown,
	candidate: string,
	applicationRoot: string,
	warn: (message: string) => void
): string | undefined {
	if (
		!(error instanceof ExactComponentAuthorizationError) ||
		(error.code !== 'not-allowed' && error.code !== 'explicitly-denied')
	)
		return undefined;
	const message = `[${error.code}] ${error.message}`;
	const identity = createHash('sha256').update(candidate).update(message).digest('hex');
	const directory = path.resolve(
		applicationRoot,
		'.exact',
		'component-policy',
		'node_modules',
		identity
	);
	mkdirSync(directory, { recursive: true });
	// Keep the guard in a generated package so bundlers apply CommonJS interop and retain its effect.
	// A throwing CommonJS module supplies an opaque export namespace without importing the denied
	// implementation. Importing that implementation even behind an ESM gate is unsafe: bundlers
	// can hoist external dependencies ahead of a gate that they inline into the importing chunk.
	writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ sideEffects: true }));
	const filename = path.join(directory, 'index.cjs');
	writeFileSync(
		filename,
		`throw Object.assign(new Error(${JSON.stringify(message)}), { code: ${JSON.stringify(error.code)} });\nmodule.exports = Object.create(null);\n`
	);
	warn(`${message}. The build can complete, but this component cannot execute under this policy.`);
	return filename;
}
