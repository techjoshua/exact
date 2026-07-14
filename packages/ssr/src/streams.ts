import { escapeAttr } from "./html.js";
import { logFrameworkEvent } from "@exact/core";
import type {
  ExactDocumentStreamEvent,
  ExactResponseLike,
  RenderToProgressiveHtmlResponseOptions,
  RenderToProgressiveHtmlStreamOptions
} from "./types.js";

export type DocumentStreamRender = (
  signal: AbortSignal,
  emit: (event: ExactDocumentStreamEvent) => void
) => Promise<void> | void;
export type ProgressiveDocumentStreamRender = (
  options: RenderToProgressiveHtmlStreamOptions,
  emit: (event: ExactDocumentStreamEvent) => void
) => Promise<void> | void;

/** Creates a readable stream containing a single HTML string. */
export function createHtmlStream(html: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(html));
      controller.close();
    }
  });
}

/** Creates an NDJSON stream of document render lifecycle events. */
export function createDocumentEventStream(
  render: DocumentStreamRender,
  options: { signal?: AbortSignal; onError?(error: unknown): void } = {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ownerController = new AbortController();
  const unlink = forwardAbort(options.signal, ownerController);
  let closed = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ExactDocumentStreamEvent): void => {
        if (closed || ownerController.signal.aborted) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      Promise.resolve(render(ownerController.signal, emit))
        .then(() => { if (!closed) { closed = true; unlink(); controller.close(); } })
        .catch(error => {
          if (closed) return;
          if (ownerController.signal.aborted) {
            closed = true;
            unlink();
            controller.error(ownerController.signal.reason ?? new DOMException("SSR stream aborted", "AbortError"));
            return;
          }
          options.onError?.(error);
          emit({ event: "error", version: 1, message: "Document rendering failed" });
          if (!closed) { closed = true; unlink(); controller.close(); }
        });
    },
    cancel(reason) {
      closed = true;
      ownerController.abort(reason);
      unlink();
    }
  });
}

/** Creates a progressive HTML stream from document render lifecycle events. */
export function createProgressiveHtmlStream(render: ProgressiveDocumentStreamRender, options: RenderToProgressiveHtmlStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const streamOptions: RenderToProgressiveHtmlStreamOptions = {
    ...options,
    rootId: progressiveRootId(options)
  };
  const abortController = new AbortController();
  const unlink = forwardAbort(options.signal, abortController);
  streamOptions.signal = abortController.signal;
  let closed = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (chunk: string): void => {
        if (closed || abortController.signal.aborted) return;
        controller.enqueue(encoder.encode(chunk));
      };
      Promise.resolve(render(streamOptions, event => {
        const chunk = progressiveHtmlChunk(event, streamOptions);
        if (chunk) emit(chunk);
      }))
        .then(() => { if (!closed) { closed = true; unlink(); controller.close(); } })
        .catch(error => {
          if (closed) return;
          if (abortController.signal.aborted) {
            closed = true;
            unlink();
            controller.error(abortController.signal.reason ?? new DOMException("SSR stream aborted", "AbortError"));
            return;
          }
          logFrameworkEvent("error", "ssr", "stream", "progressive document render failed", error, options.logger);
          emit(progressiveErrorScript(error, streamOptions));
          if (!closed) { closed = true; unlink(); controller.close(); }
        });
    },
    cancel(reason) {
      closed = true;
      abortController.abort(reason);
      unlink();
    }
  });
}

function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  const abort = () => target.abort(source.reason);
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

/** Wraps a progressive HTML stream in a runtime-neutral response object. */
export function progressiveHtmlResponse(stream: ReadableStream<Uint8Array>, options: RenderToProgressiveHtmlResponseOptions): ExactResponseLike {
  const headers = {
    ...options.headers
  };
  if (options.contentType !== undefined || !hasHeader(headers, "content-type")) {
    setHeader(headers, "content-type", options.contentType ?? "text/html; charset=utf-8");
  }
  return {
    status: options.status ?? 200,
    headers,
    body: "",
    stream
  };
}

function progressiveHtmlChunk(event: ExactDocumentStreamEvent, options: RenderToProgressiveHtmlStreamOptions): string {
  switch (event.event) {
    case "start":
    case "complete":
      return "";
    case "shell":
      return `<div id="${escapeAttr(progressiveRootId(options))}">${event.html}</div>`;
    case "replace":
      return scopedReplacementScript(event.id, event.html, options);
    case "hydration":
      return event.html;
    case "error":
      return inlineScript(`console.error("eXact document stream failed");`, options);
  }
}

function progressiveRootId(options: RenderToProgressiveHtmlStreamOptions): string {
  return options.rootId ?? "exact-root";
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some(header => header.toLowerCase() === name);
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  const existing = Object.keys(headers).find(header => header.toLowerCase() === name);
  if (existing) {
    headers[existing] = value;
  } else {
    headers[name] = value;
  }
}

function progressiveErrorScript(error: unknown, options: RenderToProgressiveHtmlStreamOptions): string {
  return inlineScript(`console.error("eXact document stream failed");`, options);
}

function scopedReplacementScript(id: string, html: string, options: RenderToProgressiveHtmlStreamOptions): string {
  const rootId = inlineJsonString(progressiveRootId(options));
  const targetId = inlineJsonString(id);
  const content = inlineJsonString(html);
  return inlineScript(`var r=document.getElementById(${rootId});if(r&&r.getAttribute("data-exact-hydrated")!=="true"){var e=r.id===${targetId}?r:Array.from(r.querySelectorAll("[id]")).find(function(n){return n.id===${targetId}});if(e){var t=document.createElement("template");t.innerHTML=${content};e.replaceChildren(t.content)}}`, options);
}

function inlineScript(body: string, options: RenderToProgressiveHtmlStreamOptions): string {
  const nonce = options.nonce === undefined ? "" : ` nonce="${escapeAttr(options.nonce)}"`;
  return `<script${nonce}>${body}</script>`;
}

function inlineJsonString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003C").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
