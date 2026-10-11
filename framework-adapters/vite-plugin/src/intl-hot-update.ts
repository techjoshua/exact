import type { IntlBuildCoordinator } from '@exactjs/intl-build';
import type { ExactPlugin } from './plugin-contracts.js';

/** Refreshes changed localization catalogs and invalidates only their participating Vite modules. */
export async function refreshExactViteCatalogModules(
	intl: IntlBuildCoordinator,
	context: Parameters<NonNullable<ExactPlugin['handleHotUpdate']>>[0]
): Promise<unknown[] | undefined> {
	if (!intl.isCatalogFile(context.file)) return undefined;
	await intl.refreshCatalogGeneration();
	const affected: unknown[] = [];
	for (const id of intl.modules.keys()) {
		const module = context.server?.moduleGraph?.getModuleById(id);
		if (!module) continue;
		context.server?.moduleGraph?.invalidateModule(module);
		affected.push(module);
	}
	return affected;
}
