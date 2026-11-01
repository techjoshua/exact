/** Keeps task failures identical with inspection attached or detached, then verifies later work. */
export async function verifyInspectedFailureOwnership({
	createExactRuntimeInspectionOwner,
	createFrameworkComponentDomain,
	createFrameworkFixtureComponentInstance,
	defineTask,
	bindTaskForHost
}) {
	for (const attached of [false, true]) {
		const events = [];
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'failure-journey',
			executionRoot: 'page'
		});
		const instance = createFrameworkFixtureComponentInstance(
			function FailureJourney() {
				return () => null;
			},
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection })
		);
		if (attached)
			inspection.attach('journey', {
				publish(event) {
					events.push(event.kind);
				}
			});
		const failure = {
			[Symbol.toPrimitive]() {
				throw new Error('conversion');
			}
		};
		const reject = bindTaskForHost(
			instance,
			defineTask({}, () => {
				throw failure;
			})
		);
		const succeed = bindTaskForHost(
			instance,
			defineTask({}, () => 42)
		);
		try {
			const outcome = await reject().then(
				() => ({ rejected: false }),
				(error) => ({ rejected: true, error })
			);
			if (!outcome.rejected || outcome.error !== failure)
				throw new Error('Inspection replaced the task failure');
			if ((await succeed()) !== 42) throw new Error('Inspection failure blocked subsequent work');
			if (attached && !events.includes('task.fail'))
				throw new Error('Inspection lost the failure event');
		} finally {
			instance.unmount();
			inspection.detach();
		}
	}
	return true;
}
