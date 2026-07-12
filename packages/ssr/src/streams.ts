import { escapeAttr } from "./html.js";
import type {
  ExactDocumentStreamEvent,
  ExactResponseLike,
  RenderToProgressiveHtmlResponseOptions,
  RenderToProgressiveHtmlStreamOptions
} from "./types.js";

export type DocumentStreamRender = (emit: (event: ExactDocumentStreamEvent) => void) => Promise<void> | void;
export type ProgressiveDocumentStreamRender = (
  options: RenderToProgressiveHtmlStreamOptions,
  emit: (event: ExactDocumentStreamEvent) => void
) => Promise<void> | void;

export function createHtmlStream(html: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(html));
      controller.close();
    }
  });
}

export function createDocumentEventStream(render: DocumentStreamRender): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ExactDocumentStreamEvent): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      Promise.resolve(render(emit))
        .then(() => controller.close())
        .catch(error => {
          emit({ event: "error", version: 1, message: error instanceof Error ? error.message : String(error) });
          controller.close();
        });
    }
  });
}

export function createProgressiveHtmlStream(render: ProgressiveDocumentStreamRender, options: RenderToProgressiveHtmlStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const streamOptions: RenderToProgressiveHtmlStreamOptions = {
    ...options,
    rootId: progressiveRootId(options)
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (chunk: string): void => {
        controller.enqueue(encoder.encode(chunk));
      };
      Promise.resolve(render(streamOptions, event => {
        const chunk = progressiveHtmlChunk(event, streamOptions);
        if (chunk) emit(chunk);
      }))
        .then(() => controller.close())
        .catch(error => {
          emit(progressiveErrorScript(error, streamOptions));
          controller.close();
        });
    }
  });
}

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
      return inlineScript(`var e=document.getElementById(${inlineJsonString(event.id)});if(e)e.innerHTML=${inlineJsonString(event.html)};`, options);
    case "hydration":
      return event.html;
    case "error":
      return inlineScript(`console.error(${inlineJsonString(`eXact document stream failed: ${event.message}`)});`, options);
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
  const message = error instanceof Error ? error.message : String(error);
  return inlineScript(`console.error(${inlineJsonString(`eXact document stream failed: ${message}`)});`, options);
}

function inlineScript(body: string, options: RenderToProgressiveHtmlStreamOptions): string {
  const nonce = options.nonce === undefined ? "" : ` nonce="${escapeAttr(options.nonce)}"`;
  return `<script${nonce}>${body}</script>`;
}

function inlineJsonString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003C").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
