export function change(state: { group: { rows: number[] } }, mode: string) {
	if (mode === 'replace') state.group = { rows: [] };
	if (mode === 'equal') state.group = state.group;
	state.group.rows.push(1);
	return state.group.rows.length;
}
