/** Checks retained nested input mutations, replacement, absence and obsolete receiver isolation. */
export async function verifyInputRelationships(root, owner, flush) {
	const nodes = [
		...root.querySelectorAll(
			'output[data-nested-projection],output[data-root-projection],output[data-literal-projection],output[data-computed-projection]'
		)
	];
	if (nodes.length !== 4) throw new Error('Missing input relationship fixture');
	const check = async (value) => {
		for (
			let tick = 0;
			tick < 100 && nodes.some((node) => node.textContent !== String(value));
			tick++
		)
			await new Promise((resolve) => setTimeout(resolve, 5));
		if (nodes.some((node) => node.textContent !== String(value)))
			throw new Error('Lost nested input relationship');
		const current = [
			...root.querySelectorAll(
				'output[data-nested-projection],output[data-root-projection],output[data-literal-projection],output[data-computed-projection]'
			)
		];
		if (current.some((node, index) => node !== nodes[index]))
			throw new Error('Replaced input relationship owner');
	};
	await check(1);
	for (const value of [2, 3]) {
		owner.state.record.value++;
		flush();
		await check(value);
	}
	const retired = owner.state.record;
	owner.state.record = { value: 10 };
	flush();
	await check(10);
	retired.value = 100;
	flush();
	await check(10);
	owner.state.record = undefined;
	flush();
	await check(0);
	owner.state.record = { value: 20 };
	flush();
	await check(20);
	return nodes;
}
