import { TaskContext } from '@exactjs/core';

/** Compiled output used to verify encoded SSR output limits. */
export function LargeOutputComponent() {
	return () => <p>éé</p>;
}

/** Compiled component whose blocking task never settles. */
export function NeverSettledComponent() {
	const wait = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await new Promise<void>(() => undefined);
	};
	wait();
	return () => <p>Loading</p>;
}
