import {
	observeComponentAsync,
	type Component,
	type ComponentInstance,
	type InteractionHandler
} from '@exactjs/core';

import { normalizePath, stripBasename } from './core.js';
import type { LinkProps, NavLinkProps, RouteContextValue } from './components.js';

/** Creates same-origin navigation while retaining async consumer work on the link owner. */
export function createLinkClickHandler(
	owner: Component<{}>,
	route: RouteContextValue,
	props: LinkProps
): InteractionHandler<[event: MouseEvent]> {
	return (event: MouseEvent) => {
		let result = props.onClick?.(event);
		if (
			result !== null &&
			(typeof result === 'object' || typeof result === 'function') &&
			typeof (result as PromiseLike<unknown>).then === 'function'
		) {
			// The link may unmount as navigation commits. Observe the consumer callback against
			// the durable Link owner before that unmount cancels the surrounding interaction.
			observeComponentAsync(owner as ComponentInstance<{}>, result, 'event', 'click');
			result = Promise.resolve(result).catch(() => undefined);
		}
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return result;
		const anchor = (event.target as Element | null)?.closest('a');
		if (!anchor || anchor.tagName.toLowerCase() !== 'a') return result;
		if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download'))
			return result;
		const location = anchor.ownerDocument.defaultView?.location;
		if (!location) return result;
		const destination = new URL((anchor as HTMLAnchorElement).href, location.href);
		if (destination.origin !== location.origin) return result;
		event.preventDefault();
		route.navigate(props.to, { replace: props.replace, state: props.state });
		return result;
	};
}

/**
 * Determines whether a navigation target matches the current route snapshot.
 * @exact pure
 */
export function navLinkActive(route: RouteContextValue, props: NavLinkProps): boolean {
	const href = route.href(props.to);
	const publicPath = href.startsWith('#')
		? (href.slice(1).split(/[?#]/)[0] ?? '/')
		: new URL(href, 'http://exact.local').pathname;
	const target = stripBasename(normalizePath(publicPath), route.basename);
	const current = route.location.pathname;
	return props.end
		? current === target
		: current === target || current.startsWith(`${target.replace(/\/$/, '')}/`);
}
