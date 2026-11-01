import {
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import { compiledElementIdentity } from '@exactjs/core/runtime/component-operations';
/** @vitest-environment jsdom */
import { render, unmount } from '@exactjs/dom/root';
import { renderToHydratableString, renderToString } from '@exactjs/ssr';
import { expect, it } from 'vitest';
import { hydrate } from './index.js';
import {
	identityButtonRoot,
	identityNestedRoot,
	identityEmptyKeysPhysicalRoot,
	identityEmptyKeysTargetRoot,
	readLexicalObjectKeys,
	identityFragmentRoot,
	identityTargetRoot,
	identitySvgRoot,
	identityMathRoot,
	identitySelectRoot,
	readIdentityClicks,
	resetIdentityClicks,
	conditionalIdentityRoot
} from './test-support/reserved-element-identity.fixtures.js';
import {
	conditionalIdentityRoot as serverConditionalIdentityRoot,
	identityButtonRoot as serverButtonRoot,
	identityNestedRoot as serverNestedRoot,
	identityEmptyKeysPhysicalRoot as serverEmptyKeysPhysicalRoot,
	identityEmptyKeysTargetRoot as serverEmptyKeysTargetRoot,
	identityFragmentRoot as serverFragmentRoot,
	identityTargetRoot as serverTargetRoot,
	identitySvgRoot as serverSvgRoot,
	identityMathRoot as serverMathRoot,
	identitySelectRoot as serverSelectRoot
} from './test-support/reserved-element-identity.fixtures.js?exact-target=server';

it.each([
	'button',
	'nested',
	'select',
	'g',
	'mi',
	'fragment',
	'target',
	'empty-physical',
	'empty-target'
] as const)(
	'protects one %s identity after opaque spread Gets during mount and hydration',
	async (tag) => {
		const client = {
			button: identityButtonRoot,
			nested: identityNestedRoot,
			select: identitySelectRoot,
			g: identitySvgRoot,
			mi: identityMathRoot,
			fragment: identityFragmentRoot,
			target: identityTargetRoot,
			'empty-physical': identityEmptyKeysPhysicalRoot,
			'empty-target': identityEmptyKeysTargetRoot
		}[tag];
		const server = {
			button: serverButtonRoot,
			nested: serverNestedRoot,
			select: serverSelectRoot,
			g: serverSvgRoot,
			mi: serverMathRoot,
			fragment: serverFragmentRoot,
			target: serverTargetRoot,
			'empty-physical': serverEmptyKeysPhysicalRoot,
			'empty-target': serverEmptyKeysTargetRoot
		}[tag];
		const physicalTag = tag === 'select' || tag === 'g' || tag === 'mi' ? tag : 'button';
		expect(readLexicalObjectKeys()).toBe(0);
		const calls: string[] = [];
		const bag: Record<string, unknown> = {
			'data-exact-ie': 'retained',
			get 'data-exact-id'() {
				calls.push('lower');
				return 'forged-lower';
			},
			get title() {
				calls.push('title');
				return 'kept';
			},
			get 'DATA-EXACT-ID'() {
				calls.push('upper');
				return 'forged-upper';
			},
			get [compiledElementIdentity]() {
				calls.push('copied-symbol');
				return 'forged-symbol';
			},
			get [Symbol.for('exact:test-unrelated')]() {
				calls.push('other-symbol');
				return 'kept-symbol';
			}
		};
		const host = document.createElement('div');
		try {
			resetIdentityClicks();
			const rendered = await renderToHydratableString(server(bag));
			expect(calls).toEqual(['lower', 'title', 'upper', 'copied-symbol', 'other-symbol']);
			const opening = rendered.html.match(new RegExp('<' + physicalTag + '\\b[^>]*>'))?.[0];
			expect(opening?.match(/data-exact-id=/gi), rendered.html).toHaveLength(1);
			expect(rendered.html).not.toContain('forged-');
			host.innerHTML = rendered.html;
			const original = host.querySelector(physicalTag)!;
			const generated = original.getAttribute('data-exact-id');
			expect(generated).toBeTruthy();
			const option = host.querySelector('option');
			const optionIdentity = option?.getAttribute('data-exact-id');
			if (tag === 'select') {
				expect(optionIdentity).toBeTruthy();
				expect(optionIdentity).not.toBe(generated);
			}
			calls.length = 0;
			hydrate(client(bag), host, { resumptions: rendered.resumptions, onMismatch: 'throw' });
			expect(host.querySelector(physicalTag)).toBe(original);
			expect(original.getAttribute('data-exact-id')).toBe(generated);
			if (tag === 'empty-physical' || tag === 'empty-target')
				expect(original.getAttribute('data-shadow')).toBe('0');
			if (option) {
				expect(host.querySelector('option')).toBe(option);
				expect(option.getAttribute('data-exact-id')).toBe(optionIdentity);
			}
			if (tag !== 'fragment') {
				expect(original.getAttribute('title')).toBe('kept');
				expect(original.getAttribute('data-exact-ie')).toBe('retained');
			}
			expect(calls).toEqual(['lower', 'title', 'upper', 'copied-symbol', 'other-symbol']);
			original.dispatchEvent(new Event(tag === 'select' ? 'change' : 'click', { bubbles: true }));
			expect(readIdentityClicks()).toBe(1);
			unmount(host);
			calls.length = 0;
			render(client(bag), host);
			expect(host.querySelector(physicalTag)?.getAttribute('data-exact-id')).toBe(generated);
			expect(calls).toEqual(['lower', 'title', 'upper', 'copied-symbol', 'other-symbol']);
		} finally {
			unmount(host);
		}
	}
);

it.each([serverButtonRoot, serverFragmentRoot, serverTargetRoot])(
	'preserves an opaque spread getter failure before later Gets (%#)',
	async (root) => {
		const calls: string[] = [];
		const bag: Record<string, unknown> = {
			get 'data-exact-id'() {
				calls.push('identity');
				throw new Error('get failed');
			},
			get title() {
				calls.push('later');
				return 'not read';
			}
		};
		await expect(renderToString(root(bag))).rejects.toThrow('get failed');
		expect(calls).toEqual(['identity']);
	}
);

it('rejects generation-5 physical operations before DOM or SSR effects', async () => {
	let executed = 0;
	const operation = Object.freeze(
		Object.create(
			Object.freeze({
				[Symbol.for('@exactjs/opaque-target-operation')]: true,
				[Symbol.for('@exactjs/opaque-component-input-generation')]: 5,
				[Symbol.for('@exactjs/opaque-target-operation-execution')]() {
					executed++;
				}
			})
		)
	);
	const host = document.createElement('div');
	try {
		expect(() => Reflect.apply(render, undefined, [operation, host])).toThrow(
			expect.objectContaining({ code: 'EXACT_COMPONENT_INPUT_INCOMPATIBLE', expectedVersion: 6 })
		);
		await expect(Reflect.apply(renderToString, undefined, [operation])).rejects.toMatchObject({
			code: 'EXACT_COMPONENT_INPUT_INCOMPATIBLE',
			expectedVersion: 6
		});
		expect(executed).toBe(0);
		expect(host.childNodes).toHaveLength(0);
	} finally {
		unmount(host);
	}
});

it('rejects the previous independent SSR writer revision before output', async () => {
	let writes = 0;
	const program = createPreparedServerRenderProgram(
		prepareCompiledRenderProgram({
			version: 4,
			id: 'old-serializer',
			namespace: 'html',
			ssr(operations, _context, _invocation, output) {
				operations.assertVersion(3);
				writes++;
				operations.static(output, '<p>must not write</p>');
				return output;
			}
		}),
		[]
	);
	await expect(renderToString(program)).rejects.toThrow('expected version 4');
	expect(writes).toBe(0);
});

it.each([true, false])(
	'retains conditional spread identity and handler after hydration (%s)',
	async (first) => {
		const host = document.createElement('div');
		try {
			const rendered = await renderToHydratableString(serverConditionalIdentityRoot(first));
			host.innerHTML = rendered.html;
			const button = host.querySelector('button')!;
			const identity = button.getAttribute('data-exact-id');
			expect(identity).toBeTruthy();
			expect(button.title).toBe(first ? 'first' : 'second');
			hydrate(conditionalIdentityRoot(first), host, {
				resumptions: rendered.resumptions,
				onMismatch: 'throw'
			});
			expect(host.querySelector('button')).toBe(button);
			expect(button.getAttribute('data-exact-id')).toBe(identity);
			button.click();
			await expect.poll(() => button.textContent).toBe(first ? '1' : '2');
			expect(button.getAttribute('data-exact-id')).toBe(identity);
		} finally {
			unmount(host);
		}
	}
);
