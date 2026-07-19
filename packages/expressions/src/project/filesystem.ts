import fs from 'node:fs';

/** Returns a stable version token for the current on-disk file state. */
export function diskFileVersion(filename: string): string {
	try {
		const stat = fs.statSync(filename, { bigint: true });
		return `disk:${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}`;
	} catch {
		return 'disk:missing';
	}
}
