/** One UTF-8 path and its uncompressed bytes in a ZIP archive. */
export type ZipArchiveEntry = {
	path: string;
	bytes: Uint8Array;
};

/**
 * Creates a standards-compliant ZIP archive with uncompressed entries.
 *
 * Storing SVG and JSON directly keeps bulk export dependency-free and deterministic, while
 * ordinary ZIP readers remain able to extract every entry.
 */
export function createZipArchive(entries: ZipArchiveEntry[]): Uint8Array {
	const encoder = new TextEncoder();
	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	let localOffset = 0;

	for (const entry of entries) {
		const name = encoder.encode(entry.path);
		const checksum = crc32(entry.bytes);
		const localHeader = new Uint8Array(30 + name.length);
		const local = new DataView(localHeader.buffer);
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true);
		local.setUint16(6, 0x0800, true);
		local.setUint32(14, checksum, true);
		local.setUint32(18, entry.bytes.length, true);
		local.setUint32(22, entry.bytes.length, true);
		local.setUint16(26, name.length, true);
		localHeader.set(name, 30);
		localParts.push(localHeader, entry.bytes);

		const centralHeader = new Uint8Array(46 + name.length);
		const central = new DataView(centralHeader.buffer);
		central.setUint32(0, 0x02014b50, true);
		central.setUint16(4, 20, true);
		central.setUint16(6, 20, true);
		central.setUint16(8, 0x0800, true);
		central.setUint32(16, checksum, true);
		central.setUint32(20, entry.bytes.length, true);
		central.setUint32(24, entry.bytes.length, true);
		central.setUint16(28, name.length, true);
		central.setUint32(42, localOffset, true);
		centralHeader.set(name, 46);
		centralParts.push(centralHeader);
		localOffset += localHeader.length + entry.bytes.length;
	}

	const centralDirectory = concatenate(centralParts);
	const end = new Uint8Array(22);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, 0x06054b50, true);
	endView.setUint16(8, entries.length, true);
	endView.setUint16(10, entries.length, true);
	endView.setUint32(12, centralDirectory.length, true);
	endView.setUint32(16, localOffset, true);
	return concatenate([...localParts, centralDirectory, end]);
}

/** Computes the checksum required by local and central ZIP records. */
function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** Joins archive records without exposing mutable intermediate storage. */
function concatenate(parts: Uint8Array[]): Uint8Array {
	const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}
