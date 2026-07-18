import type { ContextToken, RefKey } from "./index.js";

export interface ContextOptions {
  readonly global?: boolean;
  /** False preserves opaque service/class identity instead of proxying it. */
  readonly reactive?: boolean;
  /**
   * Declares where values carried by this token may reside. Unannotated
   * component values remain compiler-inferred and transferable when needed.
   */
  readonly keep?: "server" | "client" | "secret";
  /**
   * Declares where the server runtime may provision this token. Values
   * published with Component.setContext() always retain component lifetime.
   */
  readonly scope?: "component" | "application" | "request";
}

/** Creates a context token; global tokens use Symbol.for so separate bundles can share identity. */
export function createContext<T>(description: string, options: boolean | ContextOptions = false): ContextToken<T> {
  const global = typeof options === "boolean" ? options : options.global ?? false;
  const reactive = typeof options === "boolean" ? true : options.reactive ?? true;
  return {
    id: global ? Symbol.for(`exact.context:${description}`) : Symbol(description),
    description,
    global,
    reactive,
    keep: typeof options === "boolean" ? undefined : options.keep,
    scope: typeof options === "boolean" ? "component" : options.scope ?? "component"
  };
}

/** Creates a ref key that components can use to publish and read imperative values. */
export function createRef<T>(description: string): RefKey<T> {
  return { id: Symbol(description), description };
}
