import { Readable, type Writable } from "node:stream";
import type { ReactNode } from "@exact/react-compat";
import { renderReactToStringAsync, withBootstrapScripts, type ServerRenderOptions } from "./server-shared.js";
import { prerender, resume, resumeAndPrerender } from "./static-shared.js";

export { prerender, resume, resumeAndPrerender };

export async function prerenderToNodeStream(node: ReactNode, options?: ServerRenderOptions): Promise<{ prelude: Readable; postponed: null }> {
  const resolved = { ...options, nonce: undefined };
  return { prelude: Readable.from([withBootstrapScripts(await renderReactToStringAsync(node, resolved), resolved)]), postponed: null };
}

export async function resumeAndPrerenderToNodeStream(node: ReactNode, _postponedState: unknown, options?: ServerRenderOptions) {
  return prerenderToNodeStream(node, options);
}

export function resumeToPipeableStream(node: ReactNode, _postponedState: unknown, options?: ServerRenderOptions) {
  let destination: Writable | undefined;
  let html: string | undefined;
  void renderReactToStringAsync(node, options).then(value => {
    html = withBootstrapScripts(value, options ?? {});
    if (destination) Readable.from([html]).pipe(destination);
  }, error => destination?.destroy?.(error instanceof Error ? error : new Error(String(error))));
  return {
    pipe(next: Writable) {
      destination = next;
      if (html !== undefined) Readable.from([html]).pipe(next);
      return next;
    },
    abort() {}
  };
}
