import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { scope } from '@exactjs/theme/enhancements';

/** Renders independent owners around repeated and changed theme sources in a native host. */
export async function themeResolutionJourney() {
	const render = async (appearance, body, children) =>
		(
			await renderToString(
				createCompiledComponentReceipt(scope, {
					appearance,
					contrast: appearance === 'system' ? 'system' : 'standard',
					motion: appearance === 'system' ? 'system' : 'full',
					typography: { body },
					children
				}),
				{ markers: false }
			)
		).html;
	return {
		first: await render('system', 'FirstFont', 'first owner'),
		changed: await render('dark', 'SecondFont', 'second owner'),
		restored: await render('system', 'FirstFont', 'first owner'),
		reused: await render('system', 'FirstFont', 'fourth owner')
	};
}
