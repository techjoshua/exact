/**
 * Starts independently owned SSR workers without assigning a persistent process-age slot.
 * All attempts settle before a failure is returned so the caller can stop every successful child.
 */
export async function settleSsrWorkerInventoryStartup(entries, start) {
	const attempts = await Promise.allSettled(
		entries.map(async (entry) => {
			const worker = await start(entry);
			entry.worker = worker;
			return worker;
		})
	);
	return {
		workers: attempts
			.filter((attempt) => attempt.status === 'fulfilled')
			.map((attempt) => attempt.value),
		failure: attempts.find((attempt) => attempt.status === 'rejected')?.reason
	};
}
