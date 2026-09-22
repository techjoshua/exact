import '@exactjs/dom/runtime/target';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import {
	defaultFragmentPage,
	defaultTextLeafPage,
	defaultFragmentTextPage
} from './scenarios/automatic-fragment.fixtures.js';
import {
	defaultFragmentPage as serverDefaultPage,
	defaultTextLeafPage as serverDefaultTextLeafPage,
	defaultFragmentTextPage as serverDefaultTextPage
} from './scenarios/automatic-fragment.fixtures.js?exact-target=server';
import {
	DestructuredPreparedEnhancement,
	PreparedPassthrough
} from './prototypes/preparation.fixtures.js';
import {
	DestructuredPreparedEnhancement as ServerDefault,
	PreparedPassthrough as ServerPassthrough
} from './prototypes/preparation.fixtures.js?exact-target=server';
import { describe, expect, it } from 'vitest';
import {
	automaticTextHost,
	programTextHost,
	programOwner
} from './scenarios/automatic-fragment.fixtures.js';
import {
	automaticTextHost as serverAutomatic,
	programTextHost as serverProgram
} from './scenarios/automatic-fragment.fixtures.js?exact-target=server';
import { ImplicitPreparedEnhancement } from './prototypes/preparation.fixtures.js';
import { ImplicitPreparedEnhancement as ServerEnhancement } from './prototypes/preparation.fixtures.js?exact-target=server';
import { registerDomEnhancementIntegration } from '../../dom/src/renderer/enhancement-integration.js';

describe('native components within text hosts', () => {
	it('does not turn a nested scalar target into an element when a default enhancement contributes props', async () => {
		registerDomEnhancementIntegration();
		const identity = './default-fragment-routing.fixtures.js#default';
		const output = await renderToHydratableString(serverDefaultTextLeafPage, {
			enhancementCatalog: new Map([[identity, ServerDefault]])
		});
		const container = document.createElement('div');
		container.innerHTML = output.html;
		const enhancementCatalog = new Map([[identity, DestructuredPreparedEnhancement]]);
		try {
			expect(container.children).toHaveLength(0);
			hydrate(defaultTextLeafPage, container, {
				enhancementCatalog,
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			expect(container.children).toHaveLength(0);
			expect(container.textContent).toBe('unaware text');
		} finally {
			unmount(container);
		}
		try {
			render(defaultTextLeafPage, container, { enhancementCatalog });
			expect(container.children).toHaveLength(0);
			expect(container.textContent).toBe('unaware text');
		} finally {
			unmount(container);
		}
	});
	it('resolves a default enhancement on an unaware nested component inside a text host', async () => {
		registerDomEnhancementIntegration();
		const identity = './default-fragment-routing.fixtures.js#default';
		const enhancementCatalog = new Map([[identity, DestructuredPreparedEnhancement]]);
		const output = await renderToHydratableString(serverDefaultTextPage, {
			enhancementCatalog: new Map([[identity, ServerDefault]])
		});
		const container = document.createElement('div');
		container.innerHTML = output.html;
		const textarea = container.querySelector('textarea')!;
		const text = textarea.firstChild;
		const expected = 'unaware text<span title="configured">unaware text</span>';
		try {
			expect(textarea.textContent).toBe(expected);
			hydrate(defaultFragmentTextPage, container, {
				enhancementCatalog,
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			expect(textarea.firstChild).toBe(text);
			expect(textarea.textContent).toBe(expected);
			expect(textarea.children).toHaveLength(0);
		} finally {
			unmount(container);
		}
		try {
			render(defaultFragmentTextPage, container, { enhancementCatalog });
			expect(container.querySelector('textarea')?.textContent).toBe(expected);
			expect(container.querySelectorAll('span')).toHaveLength(0);
		} finally {
			unmount(container);
		}
	});
	it('keeps an unaware component transparent until its invocation activates a default contribution', async () => {
		registerDomEnhancementIntegration();
		const identity = './default-fragment-routing.fixtures.js#default';
		const output = await renderToHydratableString(serverDefaultPage, {
			enhancementCatalog: new Map([
				[identity, ServerDefault],
				['./automatic-routing.fixtures.js#passive', ServerPassthrough]
			])
		});
		const container = document.createElement('div');
		container.innerHTML = output.html;
		const host = container.querySelector('span');
		try {
			expect(host?.getAttribute('title'), output.html).toBe('configured');
			expect(container.querySelectorAll('span')).toHaveLength(1);
			hydrate(defaultFragmentPage, container, {
				enhancementCatalog: new Map([
					[identity, DestructuredPreparedEnhancement],
					['./automatic-routing.fixtures.js#passive', PreparedPassthrough]
				]),
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			expect(container.querySelector('span')).toBe(host);
			expect(container.querySelectorAll('span')).toHaveLength(1);
			expect(container.textContent).toBe('unaware textunaware textunaware text');
		} finally {
			unmount(container);
		}
	});
	it.each(['enhancement', 'program'] as const)(
		'preserves serialized %s output through hydration and updates',
		async (kind) => {
			registerDomEnhancementIntegration();
			const identity = './automatic-routing.fixtures.js#implicit';
			const server = kind === 'enhancement' ? serverAutomatic : serverProgram;
			const client = kind === 'enhancement' ? automaticTextHost : programTextHost;
			const enhancementCatalog = new Map([[identity, ImplicitPreparedEnhancement]]);
			const output = await renderToHydratableString(server, {
				enhancementCatalog: new Map([[identity, ServerEnhancement]])
			});
			const container = document.createElement('div');
			container.innerHTML = output.html;
			const textarea = container.querySelector('textarea')!;
			const text = textarea.firstChild;
			const expected =
				kind === 'enhancement'
					? '<em title="implicit">authored</em>'
					: '<strong title="first &amp; value">first &amp; value</strong>';
			try {
				expect(textarea.textContent).toBe(expected);
				hydrate(client, container, {
					enhancementCatalog,
					resumptions: output.resumptions,
					onMismatch: 'throw'
				});
				expect(textarea.firstChild).toBe(text);
				expect(textarea.textContent).toBe(expected);
				if (kind === 'program') {
					programOwner.state.value = 'next < value';
					flushSync();
					expect(textarea.firstChild).toBe(text);
					expect(textarea.textContent).toBe(
						'<strong title="next &lt; value">next &lt; value</strong>'
					);
				}
			} finally {
				unmount(container);
			}
			try {
				render(client, container, { enhancementCatalog });
				expect(container.querySelector('textarea')?.textContent).toBe(expected);
			} finally {
				unmount(container);
			}
		}
	);
});
