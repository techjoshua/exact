/** Decomposes the application-produced document without constructing a replacement shell. */
export function responseDocumentByteBreakdown(id, document) {
	const root = /<div\b[^>]*\bid="app"[^>]*>/.exec(document);
	if (!root) throw new Error('Native document is missing the comparison root');
	const hydrationScript =
		document.match(/<script\b[^>]*\bid="__exact_hydration"[^>]*>[\s\S]*?<\/script>/)?.[0] ?? '';
	const comparisonDataScript =
		document.match(/<script\b[^>]*\bid="comparison-data"[^>]*>[\s\S]*?<\/script>/)?.[0] ?? '';
	const end = document.lastIndexOf('</div>');
	if (end < root.index) throw new Error('Native document is missing the comparison root');
	const markup = document
		.slice(root.index + root[0].length, end)
		.replace(hydrationScript, '')
		.replace(comparisonDataScript, '');
	const markers = frameworkMarkerBytes(markup);
	const markerBytes = Object.values(markers).reduce((total, bytes) => total + bytes, 0);
	const identityBytes = matchingByteLength(markup, /\sdata-exact-id="[^"]*"/g);
	const hydration = hydrationPayloadBreakdown(hydrationScript);
	const documentBytes = Buffer.byteLength(document);
	const renderedBytes = Buffer.byteLength(markup);
	return {
		supported: true,
		documentBytes,
		renderedBytes,
		documentEnvelopeBytes:
			documentBytes -
			renderedBytes -
			Buffer.byteLength(hydrationScript) -
			Buffer.byteLength(comparisonDataScript),
		semanticMarkupBytes: renderedBytes - markerBytes - identityBytes,
		frameworkMarkerCommentBytes: markerBytes,
		frameworkMarkerBytesByKind: markers,
		frameworkIdentityAttributeBytes: identityBytes,
		hydrationScriptBytes: Buffer.byteLength(hydrationScript),
		hydrationPayloadBytes: hydration.bytes,
		hydrationFieldsBytes: hydration.fields,
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
