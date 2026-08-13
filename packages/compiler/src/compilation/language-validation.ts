import { loadExactConfig } from '@exactjs/config/node';
import { createExactLanguageValidationSession } from '@exactjs/language-extension-host';
import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';
import path from 'node:path';
import type { CompileProjectOptions } from '../types.js';

/** Validates compiler-owned projections through the shared Node-only package host. */
export async function validateExactLanguageProjections(
	projections: readonly ExactLanguageProjectionV1[],
	root: string,
	configured: CompileProjectOptions['languageExtensions']
): Promise<void> {
	if (configured === false || !projections.length) return;
	const workspaceRoot = path.resolve(root);
	const loaded = await loadExactConfig({ applicationRoot: workspaceRoot });
	const config = configured ?? loaded.config?.languageExtensions;
	const validation = createExactLanguageValidationSession({
		workspaceRoot,
		config,
		packageEnhancements: loaded.packageEnhancements
	});
	try {
		await validation.validate(projections);
	} finally {
		await validation.dispose();
	}
}
