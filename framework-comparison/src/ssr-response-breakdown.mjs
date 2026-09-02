/** Decomposes one immutable response into semantic and framework-owned byte categories. */
export function responseByteBreakdown(id, rendered, initialData) {
	const hydrationStart =
		id === 'exact'
			? rendered.indexOf('<script type="application/json" id="__exact_hydration"')
			: -1;
	const hydrationScript = hydrationStart < 0 ? '' : rendered.slice(hydrationStart);
	const hydrationPayload = hydrationPayloadBreakdown(hydrationScript);
	const markup = hydrationStart < 0 ? rendered : rendered.slice(0, hydrationStart);
	const markers = frameworkMarkerBytes(markup);
	const identityAttributes = matchingByteLength(markup, /\sdata-exact-id="[^"]*"/g);
	const serialized = JSON.stringify(initialData).replaceAll('<', '\\u003c');
	const comparisonDataScript =
		id === 'exact'
			? ''
			: `<script id="comparison-data" type="application/json">${serialized}</script>`;
	const document = documentHtml(id, rendered, comparisonDataScript);
	const renderedBytes = Buffer.byteLength(rendered);
	const frameworkMarkerCommentBytes = Object.values(markers).reduce(
		(total, bytes) => total + bytes,
		0
	);
	return {
		supported: true,
		documentBytes: Buffer.byteLength(document),
		renderedBytes,
		documentEnvelopeBytes:
			Buffer.byteLength(document) - renderedBytes - Buffer.byteLength(comparisonDataScript),
		semanticMarkupBytes:
			Buffer.byteLength(markup) - frameworkMarkerCommentBytes - identityAttributes,
		frameworkMarkerCommentBytes,
		frameworkMarkerBytesByKind: markers,
		frameworkIdentityAttributeBytes: identityAttributes,
		hydrationScriptBytes: Buffer.byteLength(hydrationScript),
		hydrationPayloadBytes: hydrationPayload.bytes,
		hydrationFieldsBytes: hydrationPayload.fields,
		comparisonDataScriptBytes: Buffer.byteLength(comparisonDataScript)
	};
}

function hydrationPayloadBreakdown(script) {
	if (!script) return { bytes: 0, fields: {} };
	const start = script.indexOf('>') + 1;
	const end = script.indexOf('</script>', start);
	if (start === 0 || end < start) return { bytes: 0, fields: {} };
	const source = script.slice(start, end);
	try {
		const payload = JSON.parse(source);
		if (!payload || typeof payload !== 'object' || Array.isArray(payload))
			return { bytes: Buffer.byteLength(source), fields: {} };
		return {
			bytes: Buffer.byteLength(source),
			fields: Object.fromEntries(
				Object.entries(payload).map(([field, value]) => [
					field,
					Buffer.byteLength(JSON.stringify({ [field]: value })) - 2
				])
			)
		};
	} catch {
		return { bytes: Buffer.byteLength(source), fields: {} };
	}
}

/** Builds the comparison document around one already-rendered participant body. */
export function comparisonDocumentHtml(id, rendered, initialData, payloadTarget) {
	const serialized = JSON.stringify(initialData).replaceAll('<', '\\u003c');
	const comparisonDataScript =
		id === 'exact'
			? ''
			: `<script id="comparison-data" type="application/json">${serialized}</script>`;
	const document = documentHtml(id, rendered, comparisonDataScript);
	if (payloadTarget === undefined) return document;
	const missing = payloadTarget - Buffer.byteLength(document);
	return missing > 0 ? `${document}${' '.repeat(missing)}` : document;
}

function documentHtml(id, rendered, comparisonDataScript) {
	return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="framework-participant" content="${id}"><title>Incident Operations</title></head><body><div id="app" data-render-mode="ssr">${rendered}</div>${comparisonDataScript}</body></html>`;
}

function frameworkMarkerBytes(markup) {
	const result = { component: 0, dynamic: 0, item: 0, other: 0 };
	for (const match of markup.matchAll(/<!--([\s\S]*?)-->/g)) {
		const marker = match[1];
		const kind =
			marker.startsWith('exact:component:') || marker.startsWith('/exact:component:')
				? 'component'
				: marker.startsWith('exact:dynamic:') ||
					  marker.startsWith('/exact:dynamic') ||
					  marker === 'x' ||
					  marker === '/x' ||
					  marker.startsWith('x:') ||
					  marker.startsWith('/x:')
					? 'dynamic'
					: marker.startsWith('i:') ||
						  marker.startsWith('/i:') ||
						  marker.startsWith('exact:item:') ||
						  marker.startsWith('/exact:item:')
						? 'item'
						: 'other';
		result[kind] += Buffer.byteLength(match[0]);
	}
	return result;
}

function matchingByteLength(value, expression) {
	let bytes = 0;
	for (const match of value.matchAll(expression)) bytes += Buffer.byteLength(match[0]);
	return bytes;
}
