import type { ContextToken, RefKey } from "./index.js";

export interface ContextOptions {
  readonly global?: boolean;
  /** False preserves opaque service/class identity instead of proxying it. */
  readonly reactive?: boolean;
}

/** Creates a context token; global tokens use Symbol.for so separate bundles can share identity. */
export function createContext<T>(description: string, options: boolean | ContextOptions = false): ContextToken<T> {
  const global = typeof options === "boolean" ? options : options.global ?? false;
  const reactive = typeof options === "boolean" ? true : options.reactive ?? true;
  return {
    id: global ? Symbol.for(`exact.context:${description}`) : Symbol(description),
    description,
    global,
    reactive
  };
}

/** Creates a ref key that components can use to publish and read imperative values. */
export function createRef<T>(description: string): RefKey<T> {
  return { id: Symbol(description), description };
}
