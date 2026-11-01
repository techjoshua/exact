export function touch(state: { rows: { id: string; label: string }[] }) {
	return state.rows.push();
}
