/** Captures semantic targets before hydration so adoption must retain their identity. */
export function captureTargetAttributeOwnership(root = document) {
	const owned = root.querySelector('[data-target-owned]');
	const fixed = root.querySelector('[data-target-fixed]');
	const advance = root.querySelector('[data-target-advance]');
	if (!owned || !fixed || !advance) throw new Error('Missing target attribute ownership fixture');
	return { owned, fixed, advance };
}

/** Verifies changing target layers, authored overrides and retained native control properties. */
export async function verifyTargetAttributeOwnership(root = document, targets) {
	const retained = targets ?? {
		owned: root.querySelector('[data-target-owned]'),
		fixed: root.querySelector('[data-target-fixed]'),
		advance: root.querySelector('[data-target-advance]')
	};
	if (!retained.owned || !retained.fixed || !retained.advance)
		throw new Error('Missing target attribute ownership fixture');
	for (const step of [0, 1, 2]) {
		if (step) retained.advance.click();
		for (let tick = 0; tick < 100 && retained.owned.title !== 'value ' + step; tick++)
			await new Promise((resolve) => setTimeout(resolve, 5));
		if (retained.owned.title !== 'value ' + step) throw new Error('Stale contributed title');
		if (
			root.querySelector('[data-target-owned]') !== retained.owned ||
			root.querySelector('[data-target-fixed]') !== retained.fixed
		)
			throw new Error('Target attributes replaced their retained owner');
		const classes = retained.owned.className.split(/\s+/).sort().join(' ');
		if (classes !== ['authored', 'phase-' + step].sort().join(' '))
			throw new Error('Stale contributed class');
		if (
			retained.owned.style.color !== (step % 2 ? 'blue' : 'red') ||
			retained.owned.style.borderWidth !== '1px'
		)
			throw new Error('Target style lost authored or contributed ownership');
		if (
			retained.owned.getAttribute('aria-describedby').split(/\s+/).sort().join(' ') !==
			['authored-description', 'phase-' + step].sort().join(' ')
		)
			throw new Error('Stale contributed token list');
		if (retained.owned.disabled !== (step % 2 === 1) || retained.fixed.title !== 'fixed')
			throw new Error('Target properties lost authored precedence');
	}
}

/** Detached controls must stop changing their former target attributes. */
export async function verifyTargetAttributeOwnershipDisposed(targets) {
	const title = targets.owned.title;
	targets.advance.click();
	await new Promise((resolve) => setTimeout(resolve, 10));
	if (targets.owned.title !== title) throw new Error('Disposed target owner still updated');
}
