/** Reads the encoded key from current compact or retained legacy list-item opening markers. */
export function itemMarkerKey(data: string): string | undefined {
	if (!data.startsWith('i:') && !data.startsWith('exact:item:')) return undefined;
	return data.slice(data.lastIndexOf(':') + 1);
}
