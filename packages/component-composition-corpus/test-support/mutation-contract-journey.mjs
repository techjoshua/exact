/** Exercises repeated suspended updates while retaining the output and component owner. */
export async function verifyMutationContract(root = document) {
	const scope = root.querySelector('[data-mutation-contract]');
	const output = scope.querySelector('output');
	const button = scope.querySelector('button');
	const inputs = scope.querySelector('[data-mutation-inputs]');
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
		if (scope.querySelector('[data-mutation-inputs]') !== inputs)
			throw new Error('Collection mutation replaced its output owner');
		if (scope.querySelector('output') !== output)
			throw new Error('Mutation replaced its output owner');
	}
}
