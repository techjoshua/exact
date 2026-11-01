/** Supplies a finite scalar write shared by source-owned server tasks. */
export function publishScalar(state: { nested: { value: string } }, value: string): void {
	assignValue(state.nested, value);
}

function assignValue(state: { value: string }, value: string): void {
	state.value = value;
}

/** Returns the ordinary state alias after a suspended source-owned write. */
export async function publishAsyncScalar(state: { nested: { value: string } }, value: string) {
	await Promise.resolve();
	publishScalar(state, value);
	return state.nested;
}
