import type { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import type {
	renderToString,
	renderToHydratableString,
	renderToStream,
	renderToDocumentStream,
	renderToProgressiveHtmlStream
} from '../../ssr/src/index.js';
/** Checks inherited and ordinary byte limits against successful and rejected output in five SSR modes. */
export function verifySsrOptionOwnership(api: {
	intrinsic: typeof createCompiledIntrinsicReceipt;
	renderToString: typeof renderToString;
	renderToHydratableString: typeof renderToHydratableString;
	renderToStream: typeof renderToStream;
	renderToDocumentStream: typeof renderToDocumentStream;
	renderToProgressiveHtmlStream: typeof renderToProgressiveHtmlStream;
}): Promise<true>;

/** Verifies application-selected output limits across buffered and streaming public SSR modes. */
export function verifySsrOutputPolicy(
	api: Parameters<typeof verifySsrOptionOwnership>[0]
): Promise<true>;

/** Verifies omitted and explicit application-selected traversal quotas on a broad finite tree. */
export function verifySsrTraversalPolicy(
	api: Pick<Parameters<typeof verifySsrOptionOwnership>[0], 'intrinsic' | 'renderToString'>
): Promise<true>;
