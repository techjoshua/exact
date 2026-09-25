import assert from 'node:assert/strict';
import { childExpressions, childInputs } from './island-semantic-variations.ts';

/** Captures SSR identities and edits before hydration; missing cases fail rather than skip. */
export function captureIslandSemantics(container) {
	return childExpressions.flatMap(([expression]) =>
		childInputs.map((input) => {
			const id = `${expression}-${input.id}`;
			const text = expression === 'or-effect' && input.id === 'zero' ? '' : input.text;
			const host = container.querySelector(`[data-semantic="${id}"]`);
			assert.ok(host, `${id}: SSR host`);
			const child = host.querySelector('[data-semantic-child]');
			assert.equal(child.textContent, text, `${id}: SSR child`);
			const note = host.querySelector('[data-server-note]');
			assert.ok(note, `${id}: independent server descendant`);
			const inputs = [...host.querySelectorAll('input')];
			for (const element of inputs) element.value = `Edited ${id}`;
			return { id, host, child, note, inputs, button: host.querySelector('button'), text };
		})
	);
}

/** Checks authored layout, retained ownership, two updates, and edited values after activation. */
export async function verifyIslandSemantics(container, cases) {
	for (const item of cases) {
		const { id, host, child, note, inputs, button, text } = item;
		assert.equal(container.querySelector(`[data-semantic="${id}"]`), host, `${id}: host identity`);
		assert.equal(button.textContent, 'Count 0', `${id}: captured dynamic data`);
		for (const count of [1, 2]) {
			button.click();
			for (let tick = 0; tick < 100 && button.textContent !== `Count ${count}`; tick++)
				await new Promise((resolve) => setTimeout(resolve, 5));
			assert.equal(button.textContent, `Count ${count}`, `${id}: interaction`);
		}
		assert.equal(host.querySelector('[data-semantic-child]'), child, `${id}: child identity`);
		assert.equal(child.textContent, text, `${id}: child value`);
		assert.equal(host.querySelector('[data-server-note]'), note, `${id}: server identity`);
		assert.ok(
			note.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING,
			`${id}: layout`
		);
		const currentInputs = [...host.querySelectorAll('input')];
		assert.equal(currentInputs.length, inputs.length, `${id}: input count`);
		inputs.forEach((input, index) =>
			assert.equal(currentInputs[index], input, `${id}: input identity`)
		);
		for (const element of inputs)
			assert.equal(element.value, `Edited ${id}`, `${id}: edited input`);
	}
}

/** Retained event targets must stop changing after the owning client is disposed. */
export async function verifyIslandSemanticsDisposed(cases) {
	for (const { button } of cases) button.click();
	await new Promise((resolve) => setTimeout(resolve, 10));
	for (const { id, button } of cases)
		assert.equal(button.textContent, 'Count 2', `${id}: disposal`);
}

/** Computed keys evaluate once per case during SSR and once per subsequent state update. */
export function verifySemanticReads(reads, target) {
	const expected = childExpressions
		.filter(([id]) => id.endsWith('-effect'))
		.flatMap(([id]) =>
			childInputs.flatMap((input) =>
				(target === 'updates' ? [1, 2] : [0]).map((count) => `${id}-${input.id}:${count}`)
			)
		);
	assert.deepEqual(reads, expected, `${target}: computed key evaluation count and order`);
}
