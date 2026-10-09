import { inspectExactComponentBuildFacts, type TransformOptions } from '@exactjs/compiler';
import type {
	ExactViteComponentAuthorization,
	ExactViteResolution
} from './component-authorization.js';
import type { createExactViteAuthorizationOptions } from './authorization-options.js';

/** Records and authorizes a changed component's server edges before an HMR generation can commit. */
export async function preflightExactViteChangedSource(
	source: string,
	options: TransformOptions & { filename: string },
	authorization: ExactViteComponentAuthorization,
	authorizationOptions: ReturnType<typeof createExactViteAuthorizationOptions>,
	resolve: ((request: string, importer: string) => Promise<ExactViteResolution>) | undefined
): Promise<void> {
	if (!resolve)
		throw new Error(
			`Vite cannot preflight component imports for changed module ${options.filename}`
		);
	const facts = inspectExactComponentBuildFacts(source, options);
	authorization.record(options.filename, facts, source);
	const requests = new Set([
		...facts.componentImports
			.filter((edge) => edge.artifactTargets.includes('server'))
			.map((edge) => edge.moduleSpecifier),
		...facts.rendererEnhancements.map((edge) => edge.moduleSpecifier)
	]);
	for (const request of requests) {
		const resolved = await resolve(request, options.filename);
		await authorization.authorize(resolved, request, options.filename, authorizationOptions);
	}
}
