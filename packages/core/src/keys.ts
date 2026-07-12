import type { ContextToken, RefKey } from "./index.js";

export function createContext<T>(description: string, global = false): ContextToken<T> {
  return {
    id: global ? Symbol.for(`exact.context:${description}`) : Symbol(description),
    description,
    global
  };
}

export function createRef<T>(description: string): RefKey<T> {
  return { id: Symbol(description), description };
}
