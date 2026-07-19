import { Fragment } from './api/constants.js';
import { createElement } from './api/elements.js';
import type { Key, ReactElement } from './types.js';

export { Fragment };
/** Performs the jsx domain operation. */
export function jsx(
	type: ReactElement['type'],
	props: Record<string, unknown> | null,
	key?: Key
): ReactElement {
	return createElement(type, { ...(props ?? {}), ...(key === undefined ? {} : { key }) });
}
/** Provides the canonical jsxs value. */
export const jsxs = jsx;
