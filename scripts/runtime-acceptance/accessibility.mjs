import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Copies the shared authored enhancement fixture into the existing page graph. */
export async function copyAccessibilityFixture(root, temporary) {
	await writeFile(
		path.join(temporary, 'accessibility-ownership.fixtures.tsx'),
		await readFile(
			path.join(
				root,
				'packages/component-composition-corpus/test-support/accessibility/ownership.fixtures.tsx'
			),
			'utf8'
		)
	);
}
/** Exposes observations from the same compiled module used by the page. */
export function accessibilityClientSource(pages) {
	const artifact = pages.find((entry) =>
		entry.inputFile.endsWith('accessibility-ownership.fixtures.tsx')
	);
	assert.ok(artifact, 'Missing accessibility fixture artifact');
	return `import {accessibilityOwner,accessibilityRoot,accessibilityReleased,accessibilityScope} from ${JSON.stringify(artifact.clientFile)};
window.readAccessibility=()=>({owner:accessibilityOwner,root:accessibilityOwner?.refs.get(accessibilityRoot),released:accessibilityReleased,active:accessibilityScope?.active});`;
}
/** Captures server element and relationship identity before client bootstrap. */
export async function captureAccessibilityServer(page) {
	await page.evaluate(() => {
		const root = document.getElementById('accessibility-ownership');
		if (!root) throw new Error('Missing server accessibility root');
		window.serverAccessibility = {
			root,
			help: root.querySelector('span'),
			id: root.querySelector('span').id
		};
	});
}
/** Requires passive adoption, independent nested keys and a live retained owner. */
export async function captureAccessibility(page) {
	await page.evaluate(() => {
		const current = window.readAccessibility(),
			server = window.serverAccessibility,
			root = current.root;
		if (
			root !== server.root ||
			root.querySelector('span') !== server.help ||
			server.help.id !== server.id ||
			root.querySelector('button').getAttribute('aria-describedby') !== server.id ||
			!current.active ||
			current.released.includes(current.owner)
		)
			throw new Error('Lost accessibility adoption identity/ownership');
		const input = root.querySelector('input');
		if (document.activeElement === input)
			throw new Error('Passive hydration entered initial focus');
		window.retainedAccessibility = current;
		const prior = document.activeElement,
			outer = root.querySelector('[aria-label="Outer"]'),
			inner = root.querySelector('[aria-label="Inner"]'),
			first = inner.firstElementChild,
			last = inner.lastElementChild;
		const bubbled = [];
		const observe = (event) => bubbled.push(event);
		outer.addEventListener('keydown', observe);
		try {
			first.focus();
			first.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
			);
			const event = new KeyboardEvent('keydown', {
				key: 'ArrowDown',
				bubbles: true,
				cancelable: true
			});
			last.dispatchEvent(event);
			if (document.activeElement !== last || event.defaultPrevented || !bubbled.includes(event))
				throw new Error('Nested accessibility event escaped ownership');
		} finally {
			outer.removeEventListener('keydown', observe);
			document.activeElement?.blur();
			if (prior?.isConnected) prior.focus();
		}
	});
}
/** Verifies ordinary page updates preserve the same enhancement root and relationship. */
export async function verifyRetainedAccessibility(page) {
	await page.evaluate(() => {
		const current = window.readAccessibility(),
			original = window.retainedAccessibility;
		if (
			current.owner !== original.owner ||
			current.root !== original.root ||
			!current.active ||
			current.released.includes(current.owner) ||
			current.root.querySelector('button').getAttribute('aria-describedby') !==
				window.serverAccessibility.id
		)
			throw new Error('Lost retained accessibility owner');
	});
}
/** Verifies disposal releases the actual owner, ref and native keyboard listener. */
export async function verifyDisposedAccessibility(page) {
	await page.evaluate(() => {
		const current = window.readAccessibility(),
			original = window.retainedAccessibility;
		if (
			current.owner !== original.owner ||
			current.root ||
			current.active ||
			current.released.filter((owner) => owner === original.owner).length !== 1
		)
			throw new Error('Leaked accessibility owner/ref');
		const last = original.root.querySelector('[aria-label="Inner"]').lastElementChild;
		const event = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
		last.dispatchEvent(event);
		if (event.defaultPrevented)
			throw new Error('Retained disposed accessibility keyboard listener');
	});
}
