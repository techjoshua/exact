type Row = { id: string; label: string; edge?: { street: string } };
export function append(state: { rows: Row[] }, row: Row) {
	return state.rows.push(row);
}
export const gates = new Map<string, () => void>();
export const cleaned: string[] = [];
export function gate(name: string) {
	return new Promise<void>((resolve) => gates.set(name, resolve));
}
const nativePush = Array.prototype.push;
export function overriddenPush(this: Row[], ...rows: Row[]) {
	return Reflect.apply(nativePush, this, rows) + 100;
}
