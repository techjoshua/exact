import type { SsrContext } from '../types.js';
import { escapeText } from '../html.js';
import { mapRenderValue, withRenderCleanup, type RenderValue } from './execution.js';

/**
 * Projects an ordinary request-owned render into literal title/textarea text. Native components,
 * enhancements and pending work keep their normal execution and cleanup; only physical markup
 * publication changes. Structural markers never become visible text. The enclosing host buffers
 * this region until its text settles, and restores request state even when rendering rejects.
 */
export function renderTextHostOutput(
	context: SsrContext,
	tag: string,
	render: () => RenderValue<string>
): RenderValue<string> {
	const previous = {
		depth: context.textProjectionDepth,
		markers: context.markers,
		separators: context.textSeparators
	};
	context.textProjectionDepth = context.hostStack.length;
	context.markers = false;
	context.textSeparators = false;
	return withRenderCleanup(
		() =>
			mapRenderValue(
				render(),
				(text) =>
					(tag === 'textarea' && text.startsWith('\n') ? '\n' : '') +
					escapeText(text).replaceAll('\r', '&#13;')
			),
		() => {
			context.textProjectionDepth = previous.depth;
			context.markers = previous.markers;
			context.textSeparators = previous.separators;
		}
	);
}
