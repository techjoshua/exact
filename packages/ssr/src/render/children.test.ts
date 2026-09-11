import { expect, it } from 'vitest';
import { renderChild, renderChildren } from './children.js';
import { createSsrContext } from './context.js';

it('prevents empty output metadata from contaminating subsequent renders', async () => {
	const result = await renderChild(createSsrContext({}), null, undefined, {});
	expect(Reflect.set(result, 'html', 'unexpected')).toBe(false);
	expect(Reflect.set(result, 'text', true)).toBe(false);
	expect(await renderChild(createSsrContext({}), false, undefined, {})).toEqual({
		html: '',
		text: false
	});
});

it.each([false, true])(
	'preserves empty text classification with shared sink=%s',
	async (shared) => {
		for (const [middle, expected] of [
			['', 'left<!-- --><!-- -->right'],
			[null, 'leftright']
		] as const) {
			const context = createSsrContext({ textSeparators: true });
			let published = '';
			if (shared)
				context.writerSink = {
					write(html) {
						published += html;
					},
					ready() {},
					flush() {}
				};
			const result = await renderChildren(context, ['left', middle, 'right'], undefined, {});
			expect(published + result).toBe(expected);
		}
	}
);
