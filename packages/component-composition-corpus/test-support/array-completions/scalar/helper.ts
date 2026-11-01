export const gates = new Map<string, () => void>();
export function gate(name: string) {
	return new Promise<void>((resolve) => gates.set(name, resolve));
}
