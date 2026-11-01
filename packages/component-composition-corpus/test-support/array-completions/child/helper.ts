export const gates = new Map<string, () => void>();
export const observations: {
	label: string;
	length: number;
	snapshot: number[];
	receiver: number[];
}[] = [];
export const cleaned: string[] = [];
const arrivals = new Map<string, () => void>();
export function waitForPush(label: string) {
	if (observations.some((value) => value.label === label + ':native-return'))
		return Promise.resolve();
	return new Promise<void>((resolve) => arrivals.set(label, resolve));
}
export function note(label: string, length: number, receiver: number[]) {
	observations.push({ label, length, snapshot: [...receiver], receiver });
	arrivals.get(label.replace(':native-return', ''))?.();
}
function wait(label: string) {
	return new Promise<void>((resolve) => gates.set(label, resolve));
}
export async function append(state: { values: number[] }, marker: number, label: string) {
	const returned = state.values.push(marker);
	note(label + ':native-return', returned, state.values);
	await wait(label);
	state.values.push(marker + 100);
	return returned;
}
