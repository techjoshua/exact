const markerUtf8Encoder = new TextEncoder();
const markerHexBytes = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

/** Encodes arbitrary UTF-8 data for use inside an eXact HTML comment marker. */
export function encodeExactMarkerPart(value: string): string {
	if (/^[A-Za-z0-9._-]+$/.test(value) && !value.includes('--')) return value;
	const bytes = markerUtf8Encoder.encode(value);
	let encoded = '~';
	for (let index = 0; index < bytes.length; index++) encoded += markerHexBytes[bytes[index]!]!;
	return encoded;
}

/** Decodes data emitted by encodeExactMarkerPart; directly encoded safe values pass through. */
export function decodeExactMarkerPart(value: string): string {
	if (!value.startsWith('~') || !/^(?:[0-9a-f]{2})+$/i.test(value.slice(1))) return value;
	const hex = value.slice(1);
	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < bytes.length; index++) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return new TextDecoder().decode(bytes);
}

/** Performs the exact marker start domain operation. */
export function exactMarkerStart(id: string): string {
	return `exact:${id}`;
}

/** Performs the exact marker end domain operation. */
export function exactMarkerEnd(id: string): string {
	return `/exact:${id}`;
}
