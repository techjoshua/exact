/** Exercises repeated suspended updates while retaining the output and component owner. */
export async function verifyMutationContract(root = document) {
	const scope = root.querySelector('[data-mutation-contract]');
	const output = scope.querySelector('output');
	const button = scope.querySelector('button');
	const inputs = scope.querySelector('[data-mutation-inputs]');
	const keyOrder = scope.querySelector('[data-mutation-key-order]');
	const derived = scope.querySelector('[data-mutation-derived]');
	for (let step = 1; step <= 3; step++) {
		button.click();
		for (let attempt = 0; output.textContent !== `${step}:${step}` && attempt < 100; attempt++)
			await new Promise((resolve) => setTimeout(resolve, 10));
		if (output.textContent !== `${step}:${step}`)
			throw new Error(`Expected ${step}:${step}, received ${output.textContent}`);
		const sequence = Array.from({ length: step }, (_, index) => index + 1).join(',');
		const expectedInputs = `${step},${sequence}:${step}:${sequence}`;
		if (inputs.textContent !== expectedInputs)
			throw new Error(`Expected captured inputs ${expectedInputs}, received ${inputs.textContent}`);
		for (let attempt = 0; keyOrder.textContent !== 'keyargsafterdone' && attempt < 100; attempt++)
			await new Promise((resolve) => setTimeout(resolve, 10));
		if (keyOrder.textContent !== 'keyargsafterdone')
			throw new Error('Computed member selection lost authored order: ' + keyOrder.textContent);
		if (derived.textContent !== 'true:' + step)
			throw new Error(
				'Derived collection or Boolean conversion stayed stale: ' + derived.textContent
			);
		if (
			scope.querySelector('[data-mutation-key-order]') !== keyOrder ||
			scope.querySelector('[data-mutation-derived]') !== derived
		)
			throw new Error('Derived mutation replaced its output owner');
		if (scope.querySelector('[data-mutation-inputs]') !== inputs)
			throw new Error('Collection mutation replaced its output owner');
		if (scope.querySelector('output') !== output)
			throw new Error('Mutation replaced its output owner');
	}
}
