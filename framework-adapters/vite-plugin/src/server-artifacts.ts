import type { ExactViteAuthorizationArtifacts } from './component-authorization.js';
import {
	createViteInspectionCatalog,
	inspectionCatalogEnabled,
	type ViteDebugOptions
} from './debug-output.js';
import type { ExactViteInspectionRecord } from './transform.js';

/** Emits the inspection and authorization assets owned by one Vite server build. */
export function emitExactViteServerArtifacts(
	options: Readonly<{
		applicationRoot: string | undefined;
		debug: ViteDebugOptions | undefined;
		command: 'build' | 'serve';
		inspections: ReadonlyMap<string, ExactViteInspectionRecord>;
		authorization: ExactViteAuthorizationArtifacts;
		emit(file: { type: 'asset'; fileName: string; source: string }): string;
	}>
): void {
	if (inspectionCatalogEnabled(options.debug, options.command)) {
		const catalog = createViteInspectionCatalog(
			options.applicationRoot,
			options.debug,
			options.inspections,
			options.command,
			options.authorization.audit
		);
		if (catalog)
			options.emit({
				type: 'asset',
				fileName: `.exact-inspection/${catalog.buildKey}.json`,
				source: `${JSON.stringify(catalog, null, 2)}\n`
			});
	}
	options.emit({
		type: 'asset',
		fileName: '.exact/component-library-authorization.json',
		source: `${JSON.stringify(options.authorization.manifest, null, 2)}\n`
	});
	options.emit({
		type: 'asset',
		fileName: '.exact/component-library-audit.json',
		source: `${JSON.stringify(options.authorization.audit, null, 2)}\n`
	});
}
