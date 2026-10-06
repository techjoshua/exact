/** Checks source order, reconciled spread keys, text projection and retained controls after hydration. */
export async function verifyRenderAttributeOrder(root = document) {
	const host = root.querySelector('[data-attribute-order]');
	if (!host) throw new Error('Missing render attribute fixture');
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
