import type { ContextToken, RefKey } from "./index.js";

/** Creates a context token; global tokens use Symbol.for so separate bundles can share identity. */
export function createContext<T>(description: string, global = false): ContextToken<T> {
  return {
    id: global ? Symbol.for(`exact.context:${description}`) : Symbol(description),
    description,
    global
  };
}

/** Creates a ref key that components can use to publish and read imperative values. */
export function createRef<T>(description: string): RefKey<T> {
  return { id: Symbol(description), description };
}
