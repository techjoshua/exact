import { createVNode } from "@exact/core";
import { createExactNodeHandler } from "@exact/node-adapter";
import { installNodeRequestContext } from "@exact/request/node";
import { runWithRequestContext } from "@exact/request";
import { createExactHydrationManifestConfig, createExactServerManifest, type ExactCompilerManifestLike } from "@exact/server";
import { createExactServerRuntime, renderToHydratableProgressiveHtmlResponse } from "@exact/ssr";
import type { IncomingMessage, ServerResponse } from "node:http";
import appManifestJson from "../.exact/App.exact.manifest.json" with { type: "json" };
import { ShippingCalculatorPage } from "../.exact/App.exact.server.js";
import { configuredProviderIds, quoteProvider } from "./providers/index.js";
import { resolveRoute } from "./geography.js";
import { parseRateRequest } from "./model.js";
import type { ProviderId } from "./types.js";

installNodeRequestContext();

const actionIds = ["route.resolve", "quote.doop", "quote.usps", "quote.ups", "quote.fedex", "quote.dhl"] as const;
const appManifest = appManifestJson as ExactCompilerManifestLike;
const exactManifest = createExactServerManifest(appManifest, {
  endpoint: "/__exact",
  actions: Object.fromEntries(actionIds.map(id => [id, { id, placement: "server" as const }]))
});

const actions = Object.fromEntries(actionIds.map(id => [id, async (input: { payload?: unknown }, context: { signal?: AbortSignal }) => {
  const request = parseRateRequest(input.payload);
  if (id === "route.resolve") return { state: resolveRoute(request.originZip5, request.destinationZip5) };
  const providerId = id.slice("quote.".length) as ProviderId;
  return { state: await quoteProvider(providerId, request, context.signal ?? new AbortController().signal) };
}]));

const exactRuntime = {
  ...createExactServerRuntime({ manifest: exactManifest, actions, patchStrategy: "element" }),
  limits: { maxBatchOperations: 8, maxBatchConcurrency: 6, maxRequestBytes: 128 * 1024, maxResponseBytes: 2 * 1024 * 1024 }
};
const exactHandler = createExactNodeHandler(exactRuntime);

export type ParcelLabServerOptions = {
  clientScript: string;
  stylesheet?: string;
  transformHtml?(html: string): Promise<string>;
};

export async function handleParcelLabRequest(request: IncomingMessage, response: ServerResponse, options: ParcelLabServerOptions): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname === "/__exact") { exactHandler(request, response); return; }
  if (request.method !== "GET" && request.method !== "HEAD") { response.statusCode = 405; response.end("Method Not Allowed"); return; }

  const abort = new AbortController();
  request.once("aborted", () => abort.abort(new DOMException("Request aborted", "AbortError")));
  response.once("close", () => { if (!response.writableEnded) abort.abort(new DOMException("Response closed", "AbortError")); });

  await runWithRequestContext({ url }, async () => {
    const configured = configuredProviderIds();
    const hydration = createExactHydrationManifestConfig(exactManifest, { configuredProviders: configured });
    const rendered = renderToHydratableProgressiveHtmlResponse(createVNode(ShippingCalculatorPage, { url: url.toString() }), {
      rootId: "app",
      signal: abort.signal,
      maxTaskDurationMs: 1_200,
      ...hydration
    });
    const template = documentTemplate(options);
    const html = options.transformHtml ? await options.transformHtml(template) : template;
    const [before, after] = html.split("<!--exact-app-->");
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    if (request.method === "HEAD") { response.end(); return; }
    response.write(before);
    if (rendered.stream) await pipeStream(rendered.stream, response, abort.signal);
    else response.write(rendered.body);
    response.end(after);
  });
}

function documentTemplate(options: ParcelLabServerOptions): string {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Compare domestic shipping rates, delivery windows, and optional services."><title>Parcel Lab — Shipping rate explorer</title>${options.stylesheet ? `<link rel="stylesheet" href="${options.stylesheet}">` : ""}</head><body><!--exact-app--><script type="module" src="${options.clientScript}"></script></body></html>`;
}

async function pipeStream(stream: ReadableStream<Uint8Array>, response: ServerResponse, signal: AbortSignal): Promise<void> {
  const reader = stream.getReader();
  const abort = () => void reader.cancel(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!response.write(next.value)) await new Promise<void>((resolve, reject) => {
        const closed = () => reject(new DOMException("Response closed", "AbortError"));
        response.once("drain", resolve);
        response.once("close", closed);
      });
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
