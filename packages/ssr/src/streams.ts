import { escapeAttr } from "./html.js";
import { attachSuppressedCleanupFailure, attemptCleanup, createCleanupFailure, logFrameworkEvent, throwCleanupFailure } from "@exact/core";
import type {
  ExactDocumentStreamEvent,
  ExactResponseLike,
  RenderToProgressiveHtmlResponseOptions,
  RenderToProgressiveHtmlStreamOptions
} from "./types.js";

export type DocumentStreamRender = (
  signal: AbortSignal,
  emit: (event: ExactDocumentStreamEvent) => Promise<void>
) => Promise<void> | void;
export type ProgressiveDocumentStreamRender = (
  options: RenderToProgressiveHtmlStreamOptions,
  emit: (event: ExactDocumentStreamEvent) => Promise<void>
) => Promise<void> | void;

/** Creates a demand-driven readable stream from lazily rendered HTML chunks. */
export function createHtmlStream(
  chunks: Iterable<string>,
  options: { signal?: AbortSignal; maxBytes?: number; maxChunks?: number; close?(): void } = {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = chunks[Symbol.iterator]();
  const maxBytes = positiveLimit(options.maxBytes, 16 * 1024 * 1024);
  const maxChunks = positiveLimit(options.maxChunks, 100_000);
  let bytes = 0;
  let chunkCount = 0;
  let closed = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const abort = () => {
    if (closed) return;
    const reason = options.signal?.reason ?? new DOMException("SSR stream aborted", "AbortError");
    try { close(); } catch (cleanup) { attachSuppressedCleanupFailure(reason, cleanup); }
    controller?.error(reason);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    cleanupAll(
      () => options.signal?.removeEventListener("abort", abort),
      () => { iterator.return?.(); },
      () => options.close?.()
    );
  };
  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener("abort", abort, { once: true });
    },
    pull(streamController) {
      if (options.signal?.aborted) {
        const reason = options.signal.reason ?? new DOMException("SSR stream aborted", "AbortError");
        try { close(); } catch (cleanup) { attachSuppressedCleanupFailure(reason, cleanup); }
        streamController.error(reason);
        return;
      }
      try {
        const next = iterator.next();
        if (next.done) {
          close();
          streamController.close();
          return;
        }
        if (next.value.length > maxBytes - bytes) throw new Error("SSR stream byte limit exceeded");
        const chunk = encoder.encode(next.value);
        if (++chunkCount > maxChunks) throw new Error("SSR stream chunk limit exceeded");
        bytes += chunk.byteLength;
        if (bytes > maxBytes) throw new Error("SSR stream byte limit exceeded");
        streamController.enqueue(chunk);
      } catch (error) {
        try { close(); } catch (cleanup) { attachSuppressedCleanupFailure(error, cleanup); }
        streamController.error(error);
      }
    },
    cancel() {
      close();
    }
  }, { highWaterMark: 0 });
}

/** Creates an NDJSON stream of document render lifecycle events. */
export function createDocumentEventStream(
  render: DocumentStreamRender,
  options: { signal?: AbortSignal; maxEvents?: number; maxBytes?: number; onError?(error: unknown): void } = {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ownerController = new AbortController();
  const unlink = forwardAbort(options.signal, ownerController);
  let closed = false;
  let resume: (() => void) | undefined;
  let demand = 0;
  const maxEvents = positiveLimit(options.maxEvents, 100_000);
  const maxBytes = positiveLimit(options.maxBytes, 16 * 1024 * 1024);
  let events = 0;
  let bytes = 0;
  const wake = () => { const ready = resume; resume = undefined; ready?.(); };
  ownerController.signal.addEventListener("abort", wake, { once: true });
  const cleanup = () => cleanupAll(
    () => ownerController.signal.removeEventListener("abort", wake),
    unlink
  );
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = async (event: ExactDocumentStreamEvent): Promise<void> => {
        const chunk = encoder.encode(`${JSON.stringify(event)}\n`);
        if (++events > maxEvents) throw new Error("SSR stream event limit exceeded");
        bytes += chunk.byteLength;
        if (bytes > maxBytes) throw new Error("SSR stream byte limit exceeded");
        while (!closed && !ownerController.signal.aborted && demand <= 0) {
          await new Promise<void>(resolve => { resume = resolve; });
        }
        if (closed || ownerController.signal.aborted) throw ownerController.signal.reason ?? new DOMException("SSR stream aborted", "AbortError");
        demand--;
        controller.enqueue(chunk);
      };
      Promise.resolve(render(ownerController.signal, emit))
        .then(() => {
          if (closed) return;
          closed = true;
          try { cleanup(); controller.close(); }
          catch (cleanupError) { controller.error(cleanupError); }
        })
        .catch(error => {
          if (closed) return;
          if (ownerController.signal.aborted) {
            closed = true;
            const reason = ownerController.signal.reason ?? new DOMException("SSR stream aborted", "AbortError");
            try { cleanup(); } catch (cleanupError) { attachSuppressedCleanupFailure(reason, cleanupError); }
            controller.error(reason);
            return;
          }
          options.onError?.(error);
          void emit({ event: "error", version: 1, message: "Document rendering failed" }).then(() => {
            if (!closed) {
              closed = true;
              try { cleanup(); controller.close(); }
              catch (cleanupError) { controller.error(cleanupError); }
            }
          }, emitError => {
            if (!closed) {
              closed = true;
              try { cleanup(); } catch (cleanupError) { attachSuppressedCleanupFailure(emitError, cleanupError); }
              controller.error(emitError);
            }
          });
        });
    },
    pull() { demand++; const ready = resume; resume = undefined; ready?.(); },
    cancel(reason) {
      closed = true;
      resume?.();
      resume = undefined;
      ownerController.abort(reason);
      cleanup();
    }
  }, { highWaterMark: 0 });
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
  let resume: (() => void) | undefined;
  let demand = 0;
  const maxEvents = positiveLimit(options.maxStreamEvents, 100_000);
  const maxBytes = positiveLimit(options.maxStreamBytes, 16 * 1024 * 1024);
  let events = 0;
  let bytes = 0;
  const wake = () => { const ready = resume; resume = undefined; ready?.(); };
  abortController.signal.addEventListener("abort", wake, { once: true });
  const cleanup = () => cleanupAll(
    () => abortController.signal.removeEventListener("abort", wake),
    unlink
  );
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const waitForDemand = async (): Promise<void> => {
        while (!closed && !abortController.signal.aborted && demand <= 0) {
          await new Promise<void>(resolve => { resume = resolve; });
        }
        if (closed || abortController.signal.aborted) throw abortController.signal.reason ?? new DOMException("SSR stream aborted", "AbortError");
      };
      const emit = async (chunk: string): Promise<void> => {
        const encoded = encoder.encode(chunk);
        if (++events > maxEvents) throw new Error("SSR stream event limit exceeded");
        bytes += encoded.byteLength;
        if (bytes > maxBytes) throw new Error("SSR stream byte limit exceeded");
        await waitForDemand();
        demand--;
        controller.enqueue(encoded);
      };
      Promise.resolve(render(streamOptions, async event => {
        const chunk = progressiveHtmlChunk(event, streamOptions);
        if (chunk) await emit(chunk);
        else await waitForDemand();
      }))
        .then(() => {
          if (closed) return;
          closed = true;
          try { cleanup(); controller.close(); }
          catch (cleanupError) { controller.error(cleanupError); }
        })
        .catch(error => {
          if (closed) return;
          if (abortController.signal.aborted) {
            closed = true;
            const reason = abortController.signal.reason ?? new DOMException("SSR stream aborted", "AbortError");
            try { cleanup(); } catch (cleanupError) { attachSuppressedCleanupFailure(reason, cleanupError); }
            controller.error(reason);
            return;
          }
          logFrameworkEvent("error", "ssr", "stream", "progressive document render failed", error, options.logger);
          void emit(progressiveErrorScript(error, streamOptions)).then(() => {
            if (!closed) {
              closed = true;
              try { cleanup(); controller.close(); }
              catch (cleanupError) { controller.error(cleanupError); }
            }
          }, emitError => {
            if (!closed) {
              closed = true;
              try { cleanup(); } catch (cleanupError) { attachSuppressedCleanupFailure(emitError, cleanupError); }
              controller.error(emitError);
            }
          });
        });
    },
    pull() { demand++; const ready = resume; resume = undefined; ready?.(); },
    cancel(reason) {
      closed = true;
      resume?.();
      resume = undefined;
      abortController.abort(reason);
      cleanup();
    }
  }, { highWaterMark: 0 });
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function cleanupAll(...actions: Array<() => void>): void {
  const failure = createCleanupFailure();
  for (const action of actions) attemptCleanup(failure, action);
  throwCleanupFailure(failure);
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
  return inlineScript(`var r=document.getElementById(${rootId});if(r&&r.getAttribute("data-exact-hydrated")!=="true"){var e=document.getElementById(${targetId});if(e&&(e===r||r.contains(e))){var t=document.createElement("template");t.innerHTML=${content};e.replaceChildren(t.content)}}`, options);
}

function inlineScript(body: string, options: RenderToProgressiveHtmlStreamOptions): string {
  const nonce = options.nonce === undefined ? "" : ` nonce="${escapeAttr(options.nonce)}"`;
  return `<script${nonce}>${body}</script>`;
}

function inlineJsonString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003C").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
