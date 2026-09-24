/** Defines the parsed html node type contract. */
export type ParsedHtmlNode = ParsedHtmlElement | ParsedHtmlText;

/** Defines the parsed html element type contract. */
export type ParsedHtmlElement = {
	kind: 'element';
	tagName: string;
	attributes: Map<string, string | true>;
	children: ParsedHtmlNode[];
};

/** Defines the parsed html text type contract. */
export type ParsedHtmlText = {
	kind: 'text';
	value: string;
};

/** Provides the canonical max diff html bytes value. */
export const MAX_DIFF_HTML_BYTES = 2 * 1024 * 1024;

/** Provides the canonical max diff html nodes value. */
export const MAX_DIFF_HTML_NODES = 100_000;

/** Provides the canonical max diff html depth value. */
export const MAX_DIFF_HTML_DEPTH = 256;

/** Provides the canonical max fine grained patches value. */
export const MAX_FINE_GRAINED_PATCHES = 10_000;
