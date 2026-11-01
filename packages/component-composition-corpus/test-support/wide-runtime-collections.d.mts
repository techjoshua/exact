import type { diffBoundaryHtml } from '../../ssr/src/diff.js';
import type { paginateInspectionSources } from '../../devtools-runtime/src/query/collection-pagination.js';
import type { createExactClient } from '../../hydrate/src/index.js';
/** Checks valid large style updates and removals retain their patch fallback. */
export function verifyWideStyleDiff(
	api: { diffBoundaryHtml: typeof diffBoundaryHtml },
	count?: number
): void;
/** Checks inspection ordering and completion at a configured page size. */
export function verifyWideInspectionPage(
	api: { paginateInspectionSources: typeof paginateInspectionSources },
	count?: number
): Promise<void>;
/** Checks public dispatch and disposal with many continuation boundary keys. */
export function verifyWideHydrationOrdering(
	api: { createExactClient: typeof createExactClient },
	document: Document,
	count?: number
): Promise<void>;

/** Checks finite source traversal and retained remote offsets. */
export function verifyFiniteInspectionSources(
	api: {
		paginateInspectionSources: typeof import('../../devtools-runtime/src/query/collection-pagination.js').paginateInspectionSources;
	},
	count?: number
): Promise<void>;
