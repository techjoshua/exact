/** Returns whether rendered output is a normalized complete HTML document. */
export function isExactDocumentHtml(html: string): boolean {
	return html.startsWith('<!doctype html>');
}

/** Finds the final body close without scanning canonical contents; preserves other closing-tag casing. */
export function findDocumentBodyClose(html: string): number {
	return html.endsWith('</body></html>')
		? html.length - '</body></html>'.length
		: html.toLowerCase().lastIndexOf('</body>');
}

/** Inserts framework-owned nodes in the reserved region before </body>. */
export function augmentDocumentBody(html: string, frameworkHtml: string): string {
	if (!isExactDocumentHtml(html)) return `${html}${frameworkHtml}`;
	const bodyClose = findDocumentBodyClose(html);
	if (bodyClose < 0)
		throw new Error('Normalized eXact document output is missing its closing </body> element.');
	const augmentation = frameworkHtml
		? `<!--exact:framework-body:start-->${frameworkHtml}<!--exact:framework-body:end-->`
		: '';
	return `${html.slice(0, bodyClose)}${augmentation}${html.slice(bodyClose)}`;
}
