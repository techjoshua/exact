type Row = { label: string };
export function root(state: { rows: Row[] }) {
	state.rows.push({ label: 'added' });
}
export function member(state: { rows: Row[] }) {
	state.rows[0]!.label = 'changed';
}
export function opaque(state: { rows: unknown }) {
	if (Array.isArray(state.rows)) state.rows.push(1);
}
