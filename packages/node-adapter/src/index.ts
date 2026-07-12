import type { IncomingMessage, ServerResponse } from "node:http";
import { handleExactRequest, type ExactResponseLike, type ExactServerContext } from "@exact/server";

/** Creates a Node http.createServer-compatible eXact endpoint handler. */
export function createExactNodeHandler(context: ExactServerContext): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void handleExactRequest({
      method: request.method ?? "GET",
      url: request.url,
      headers: request.headers,
      text: () => readNodeRequestBody(request)
    }, context).then(
      result => writeNodeResponse(response, result),
      error => writeNodeError(response, error)
    );
  };
}

/** Reads a Node IncomingMessage body as UTF-8 text. */
export function readNodeRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/** Writes an eXact response object to a Node ServerResponse. */
export function writeNodeResponse(response: ServerResponse, result: ExactResponseLike): void {
  response.statusCode = result.status;
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  if (result.stream) {
    void pipeReadableStream(result.stream, chunk => response.write(chunk), () => response.end(), error => response.destroy(error as Error));
  } else {
    response.end(result.body ?? "");
  }
}

function writeNodeError(response: ServerResponse, error: unknown): void {
  response.statusCode = 500;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ error: "internal_error" }));
  if (error instanceof Error) process.emitWarning(error);
}

async function pipeReadableStream(
  stream: ReadableStream<Uint8Array>,
  write: (chunk: Uint8Array) => void,
  end: () => void,
  fail: (error: unknown) => void
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      write(next.value);
    }
    end();
  } catch (error) {
    fail(error);
  }
}

export { createExactNodeHandler as createNodeHandler };
