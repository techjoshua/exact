export function push(s: { rows: number[] | (number | string)[] }) {
	s.rows.push(2);
}
export function reverse(s: { rows: number[] | (number | string)[] }) {
	s.rows.reverse();
}
