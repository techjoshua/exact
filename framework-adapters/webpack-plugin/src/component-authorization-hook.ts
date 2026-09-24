import { fileURLToPath } from 'node:url';
import { webpackEnhancementFacadeProvenance } from './enhancement-facades.js';
import {
	authorizeWebpackResolvedComponent,
	type ExactWebpackAuthorizationOptions,
	type ExactWebpackComponentResolver
} from './sessions.js';
import type { WebpackAfterResolveData } from './resolution-contracts.js';

/** Authorizes the original provider edge before Webpack loads a module or its optional facade. */
export async function authorizeWebpackModuleResolution(
	data: WebpackAfterResolveData | false | undefined,
	sessionId: string,
	options: ExactWebpackAuthorizationOptions,
	resolvePublished: ExactWebpackComponentResolver | undefined,
	watchFile?: (filename: string) => void
): Promise<void> {
	if (!data || !data.createData) return;
	let request = data.createData.rawRequest ?? data.request;
	let importer = data.contextInfo?.issuer;
	let resource = data.createData.resource;
	const facade = webpackEnhancementFacadeProvenance(resource);
	if (facade && resolvePublished) {
		request = facade.request;
		importer = facade.importer;
		try {
			resource = await resolvePublished(request, importer);
		} catch (error) {
			// The physical facade already contains the pass-through implementation when absent.
			if (error instanceof Error && error.message.includes(`Can't resolve '${request}'`)) return;
			throw error;
		}
	}
	if (!request || !importer || !resource) return;
	const authorization = await authorizeWebpackResolvedComponent(
		sessionId,
		options,
		request,
		importer,
		resource,
		resolvePublished,
		watchFile
	);
	if (typeof authorization === 'object') data.createData.resource = authorization.guard;
	// Replace the facade itself: replacing only its provider would leave a named export undefined.
	if (authorization === 'omitted')
		data.createData.resource = fileURLToPath(new URL('./omitted-enhancement.js', import.meta.url));
}
