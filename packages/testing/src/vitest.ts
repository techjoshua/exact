export { exactMatchers } from "./index.js";
export { installExactMatchers as installVitestMatchers } from "./index.js";
export type { ExactMatcherDeclarations, ExpectLike } from "./index.js";

import type { ExactMatcherDeclarations } from "./index.js";
import type {} from "vitest";
declare module "vitest" {
  interface Assertion<T = any> extends ExactMatcherDeclarations<void> {}
  interface AsymmetricMatchersContaining extends ExactMatcherDeclarations<void> {}
}
