import { createElement, Fragment } from "./index.js";
import type { Key, ReactElement } from "./types.js";

export { Fragment };
export function jsx(type: ReactElement["type"], props: Record<string, unknown> | null, key?: Key): ReactElement {
  return createElement(type, { ...(props ?? {}), ...(key === undefined ? {} : { key }) });
}
export const jsxs = jsx;
