/** Registers Bun project-source and callable-input checks through the owned adapter test lifecycle. */
export function registerProjectSourceIsolationIntegration(
	describeBun: (name: string, factory: () => void) => unknown,
	testApi: Pick<typeof import('vitest'), 'it'>
): void {
	describeBun('project source isolation', () => {
		testApi.it(
			'preserves invoked callable requirements and receiver semantics',
			async () => {
				const { verifyComponentCallableInputs } = await import(
					'./component-callable-input-contract.js'
				);
				await verifyComponentCallableInputs('bun');
			},
			240000
		);
		testApi.it(
			'preserves reassigned callable requirements in both artifacts',
			async () => {
				const { verifyReassignedCallableModules } = await import(
					'./reassigned-callable-contract.js'
				);
				await verifyReassignedCallableModules('bun');
			},
			60000
		);

		testApi.it(
			'preserves projected module writes in both artifacts',
			async () => {
				const { verifyProjectedModuleWrites } = await import('./project-source-isolation.js');
				await verifyProjectedModuleWrites('bun');
			},
			60000
		);

		testApi.it(
			'isolates unrelated project initializers in both artifacts',
			async () => {
				const { verifyProjectSourceIsolation } = await import('./project-source-isolation.js');
				await verifyProjectSourceIsolation('bun');
			},
			60000
		);
		testApi.it(
			'validates selected module initialization before partitioning',
			async () => {
				const { verifySelectedModulePartition } = await import('./selected-module-partition.js');
				await verifySelectedModulePartition('bun');
			},
			90000
		);
	});
}
