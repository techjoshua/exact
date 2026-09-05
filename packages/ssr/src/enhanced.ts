import { withExactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import * as ssr from './public.js';

export * from './public.js';

/** Renders one operation tree with the application enhancement catalog during synchronous SSR. */
export const renderToString: typeof ssr.renderToString = (operation, options) =>
	ssr.renderToString(operation, withExactEnhancementCatalog(options));
/** Renders an asynchronously resolved operation tree with application enhancements enabled. */
export const renderToStringAsync: typeof ssr.renderToStringAsync = (operation, options) =>
	ssr.renderToStringAsync(operation, withExactEnhancementCatalog(options));
/** Renders synchronous HTML plus hydration contracts using the application enhancement catalog. */
export const renderToHydratableString: typeof ssr.renderToHydratableString = (operation, options) =>
	ssr.renderToHydratableString(operation, withExactEnhancementCatalog(options));
/** Renders asynchronous HTML plus hydration contracts using the application enhancement catalog. */
export const renderToHydratableStringAsync: typeof ssr.renderToHydratableStringAsync = (
	operation,
	options
) => ssr.renderToHydratableStringAsync(operation, withExactEnhancementCatalog(options));
/** Streams an operation tree while resolving enhancements from the application catalog. */
export const renderToStream: typeof ssr.renderToStream = (operation, options) =>
	ssr.renderToStream(operation, withExactEnhancementCatalog(options));
/** Streams a complete HTML document with application enhancements enabled. */
export const renderToDocumentStream: typeof ssr.renderToDocumentStream = (operation, options) =>
	ssr.renderToDocumentStream(operation, withExactEnhancementCatalog(options));
/** Streams a hydratable HTML document with application enhancement metadata. */
export const renderToHydratableDocumentStream: typeof ssr.renderToHydratableDocumentStream = (
	operation,
	options
) => ssr.renderToHydratableDocumentStream(operation, withExactEnhancementCatalog(options));
/** Progressively streams HTML while application enhancement work and async content settle. */
export const renderToProgressiveHtmlStream: typeof ssr.renderToProgressiveHtmlStream = (
	operation,
	options
) => ssr.renderToProgressiveHtmlStream(operation, withExactEnhancementCatalog(options));
/** Progressively streams hydratable HTML with application enhancement metadata. */
export const renderToHydratableProgressiveHtmlStream: typeof ssr.renderToHydratableProgressiveHtmlStream =
	(operation, options) =>
		ssr.renderToHydratableProgressiveHtmlStream(operation, withExactEnhancementCatalog(options));
/** Creates a progressive HTML response whose render can resolve application enhancements. */
export const renderToProgressiveHtmlResponse: typeof ssr.renderToProgressiveHtmlResponse = (
	operation,
	options
) => ssr.renderToProgressiveHtmlResponse(operation, withExactEnhancementCatalog(options));
/** Creates a hydratable progressive response carrying application enhancement metadata. */
export const renderToHydratableProgressiveHtmlResponse: typeof ssr.renderToHydratableProgressiveHtmlResponse =
	(operation, options) =>
		ssr.renderToHydratableProgressiveHtmlResponse(operation, withExactEnhancementCatalog(options));
/** Handles one eXact server request and renders its HTML with application enhancements enabled. */
export const renderExactRequestToHtmlResponse: typeof ssr.renderExactRequestToHtmlResponse = (
	request,
	server,
	render,
	options
) =>
	ssr.renderExactRequestToHtmlResponse(
		request,
		server,
		render,
		withExactEnhancementCatalog(options)
	);
/** Handles one eXact server request as a progressive response with application enhancements enabled. */
export const renderExactRequestToProgressiveHtmlResponse: typeof ssr.renderExactRequestToProgressiveHtmlResponse =
	(request, server, render, options) =>
		ssr.renderExactRequestToProgressiveHtmlResponse(
			request,
			server,
			render,
			withExactEnhancementCatalog(options)
		);
