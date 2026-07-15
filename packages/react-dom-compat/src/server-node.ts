import { Readable, type Writable } from "node:stream";
import type { ReactNode } from "@exact/react-compat";
import {
  renderReactToString,
  renderReactToStringAsync,
  renderToReadableStream,
  renderToStaticMarkup,
  renderToString,
  type ServerRenderOptions,
  withBootstrapScripts
} from "./server-shared.js";

export { renderToReadableStream, renderToStaticMarkup, renderToString };
export type { ServerRenderOptions };

export interface PipeableStreamOptions extends ServerRenderOptions {
  onShellReady?: () => void;
  onShellError?: (error: unknown) => void;
  onAllReady?: () => void;
}

export interface PipeableStream {
  pipe(destination: Writable): Writable;
  abort(reason?: unknown): void;
}

function nodeStream(html: string): Readable {
  return Readable.from([html]);
}

export function renderToNodeStream(node: ReactNode, options?: ServerRenderOptions): Readable {
  return nodeStream(renderReactToString(node, options));
}

export function renderToStaticNodeStream(node: ReactNode, options?: ServerRenderOptions): Readable {
  return nodeStream(renderReactToString(node, options));
}

export function renderToPipeableStream(node: ReactNode, options: PipeableStreamOptions = {}): PipeableStream {
  const controller = new AbortController();
  let destination: Writable | undefined;
  let completed: string | undefined;
  let failed: unknown;
  const pump = () => {
    if (!destination) return;
    if (failed !== undefined) {
      destination.destroy?.(failed instanceof Error ? failed : new Error(String(failed)));
      return;
    }
    if (completed !== undefined) nodeStream(completed).pipe(destination);
  };
  void renderReactToStringAsync(node, { ...options, signal: controller.signal }).then(html => {
    completed = withBootstrapScripts(html, options);
    options.onShellReady?.();
    options.onAllReady?.();
    pump();
  }, error => {
    failed = error;
    options.onShellError?.(error);
    pump();
  });
  return {
    pipe(next) {
      if (destination) throw new Error("React compatibility stream has already been piped");
      destination = next;
      pump();
      return next;
    },
    abort(reason) {
      controller.abort(reason ?? new Error("The render was aborted"));
    }
  };
}
