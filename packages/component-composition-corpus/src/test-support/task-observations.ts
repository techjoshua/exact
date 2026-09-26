/** One externally controlled task invocation used by the compiled composition tests. */
export interface TaskProbe {
	query: string;
	signal: AbortSignal;
	resolve(value: string): void;
	cleaned: boolean;
}

/** Observable task starts and cleanup, independent of compiler-generated task identities. */
export const taskProbes: TaskProbe[] = [];

/** Pauses a task until the test supplies its result. Cancellation is owned by the task runtime. */
export function waitForTask(query: string, signal: AbortSignal): Promise<string> {
	return new Promise((resolve) => {
		taskProbes.push({ query, signal, resolve, cleaned: false });
	});
}

/** Records cleanup against the generation's unique signal, including superseded work. */
export function recordTaskCleanup(signal: AbortSignal): void {
	const probe = taskProbes.find((candidate) => candidate.signal === signal);
	if (probe) probe.cleaned = true;
}
