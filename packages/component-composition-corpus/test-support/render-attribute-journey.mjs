/** Checks source order, reconciled spread keys, text projection and retained controls after hydration. */
export async function verifyRenderAttributeOrder(root = document) {
	const host = root.querySelector('[data-attribute-order]');
	if (!host) throw new Error('Missing render attribute fixture');
	const classNodes = [...host.querySelectorAll('[data-class-keys]')];
	for (const [index, value] of [
		'base __proto__ constructor prototype',
		'base',
		'base __proto__ constructor prototype'
	].entries()) {
		if (index) host.querySelector('[data-class-toggle]').click();
		for (
			let tick = 0;
			tick < 100 && classNodes.some((node) => node.getAttribute('class') !== value);
			tick++
		)
			await new Promise((resolve) => setTimeout(resolve, 5));
		if (classNodes.some((node) => node.getAttribute('class') !== value))
			throw new Error('Lost prototype-named conditional class token');
		if ([...host.querySelectorAll('[data-class-keys]')].some((node, i) => node !== classNodes[i]))
			throw new Error('Replaced conditional class owner');
	}
	let delivered = 0;
	for (const node of host.querySelectorAll('[data-handler]')) {
		node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const result = host.querySelector('[data-handler-result]');
		const expected = `${++delivered}:click`;
		for (let tick = 0; tick < 100 && result.textContent !== expected; tick++)
			await new Promise((resolve) => setTimeout(resolve, 5));
		if (result.textContent !== expected) throw new Error('Lost mutable handler event argument');
	}
	const mathNodes = [...host.querySelectorAll('[data-math-properties]')];
	for (const [index, [display, color, thickness]] of [
		['block', 'red', '1px'],
		['inline', 'blue', '2px'],
		['block', 'red', '1px']
	].entries()) {
		for (const node of mathNodes) {
			for (let tick = 0; tick < 100 && node.getAttribute('display') !== display; tick++)
				await new Promise((resolve) => setTimeout(resolve, 5));
			if (
				node.namespaceURI !== 'http://www.w3.org/1998/Math/MathML' ||
				node.getAttribute('display') !== display ||
				node.getAttribute('mathcolor') !== color ||
				node.querySelector('mfrac')?.getAttribute('linethickness') !== thickness
			)
				throw new Error('Lost MathML attributes or namespace');
		}
		if (
			[...host.querySelectorAll('[data-math-properties]')].some(
				(node, index) => node !== mathNodes[index]
			)
		)
			throw new Error('Replaced MathML property owner');
		if (index < 2) host.querySelector('[data-math-toggle]').click();
	}
	const fixed = host.querySelector('[data-attribute-fixed]');
	const spread = host.querySelector('[data-attribute-spread]');
	const fixedInput = host.querySelector('[data-attribute-fixed-input]');
	const spreadInput = host.querySelector('[data-attribute-spread-input]');
	const textarea = host.querySelector('textarea');
	const button = host.querySelector('[data-attribute-step]');
	for (const title of ['spread', 'updated', 'restored']) {
		if (title !== 'spread') button.click();
		for (let tick = 0; tick < 100 && spread.title !== title; tick++)
			await new Promise((resolve) => setTimeout(resolve, 5));
		if (fixed.title !== 'fixed' || fixed.id !== 'fixed-id' || spread.title !== title)
			throw new Error('Lost literal or spread precedence');
		if (!fixedInput.required || fixedInput.maxLength !== 4 || fixedInput.className !== 'fixed')
			throw new Error('Spread bypassed fixed control properties');
		if (
			spreadInput.required !== (title === 'updated') ||
			spreadInput.maxLength !== (title === 'updated' ? 4 : 2)
		)
			throw new Error('Removed spread keys did not restore authored controls');
		if (
			[...host.querySelectorAll('textarea')].some(
				(text) => !text.defaultValue.includes(`title="${title}"`)
			)
		)
			throw new Error('Text projection lost reconciled spread observation');
		if (
			host.querySelector('[data-attribute-spread]') !== spread ||
			host.querySelector('textarea') !== textarea
		)
			throw new Error('Property updates replaced retained nodes');
	}
	host.querySelector('[data-generation-step]').click();
	const publication = host.querySelector('[data-generation-state]');
	for (let tick = 0; tick < 100 && publication.textContent !== 'published'; tick++)
		await new Promise((resolve) => setTimeout(resolve, 5));
	if (publication.textContent !== 'published')
		throw new Error('Lost task generation publication signal');
}
