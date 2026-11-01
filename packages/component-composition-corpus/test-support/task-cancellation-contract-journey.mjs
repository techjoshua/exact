/** Keeps arbitrary cancellation reasons, releases owned work and recognizes compatible provider errors. */
export async function verifyTaskCancellationContract(api, foreign = api) {
	for (const reason of [
		{
			toString() {
				throw new Error('conversion');
			}
		},
		{
			get toString() {
				throw new Error('conversion');
			}
		},
		{
			[Symbol.toPrimitive]() {
				throw new Error('conversion');
			}
		}
	]) {
		const direct = new api.TaskCancellation(reason);
		check(
			direct.reason === reason && api.isTaskCancellation(direct),
			'Cancellation construction lost its reason'
		);
		let release;
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		let cleaned = 0;
		const execution = api.runTaskFrame(
			{ kind: 'cancellation-contract' },
			{
				work(task) {
					task.cleanup(() => {
						cleaned++;
					});
					return gate;
				}
			}
		);
		const outcome = execution.catch((error) => error);
		try {
			execution.cancel(reason);
			const error = await outcome;
			check(
				api.isTaskCancellation(error) && error.reason === reason,
				'Active cancellation lost its reason'
			);
			check(cleaned === 1, 'Cancellation abandoned owned cleanup');
		} finally {
			release();
			await outcome;
		}
	}
	const hostError = new api.TaskCancellation('host');
	const foreignError = new foreign.TaskCancellation('foreign');
	check(
		api.isTaskCancellation(foreignError) && foreign.isTaskCancellation(hostError),
		'Compatible provider cancellation was classified as failure'
	);
	check(
		!api.isTaskCancellation(new DOMException('ordinary', 'AbortError')),
		'A platform AbortError was treated as framework cancellation'
	);
	const hostile = new Proxy(
		{},
		{
			getPrototypeOf() {
				throw new Error('prototype');
			}
		}
	);
	check(!api.isTaskCancellation(hostile), 'A hostile prototype was treated as cancellation');
	const failed = await api
		.runTaskFrame(
			{ kind: 'failure' },
			{
				work() {
					throw hostile;
				}
			}
		)
		.catch((error) => error);
	check(failed === hostile, 'Cancellation classification replaced the primary failure');
	check(
		(await api.runTaskFrame({ kind: 'next' }, { work: () => 1 })) === 1,
		'Cancellation prevented subsequent work'
	);
}

function check(condition, message) {
	if (!condition) throw new Error(message);
}
