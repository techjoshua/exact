import { describe, expect, it, vi } from "vitest";
import {
  createExactHydrationStateContracts,
  createExactServerManifest,
  createExpressHandler,
  createFetchHandler,
  createHapiHandler,
  handleExactRequest,
  type ExactServerContext
} from "./index.js";

const noopLogger = {
  isEnabled: () => false,
  log() {}
};

function context(overrides: Partial<ExactServerContext> = {}): ExactServerContext {
  return {
    manifest: {
      version: 1,
      actions: {
        "allowed-action": { id: "allowed-action", placement: "server" }
      },
      boundaries: {
        "allowed-boundary": { id: "allowed-boundary" }
      }
    },
    actions: {
      "allowed-action": async input => ({
        patches: [{ type: "text", id: "title", value: String((input.payload as { title?: string }).title ?? "") }]
      })
    },
    refreshBoundaries: {
      "allowed-boundary": () => ({
        patches: [{ type: "replace", id: "allowed-boundary", html: "<section>Updated</section>" }]
      })
    },
    logger: noopLogger,
    ...overrides
  };
}

describe("@exact/server", () => {
  it("creates runtime allowlists from compiler manifests", () => {
    const manifest = createExactServerManifest({
      version: 1,
      serverActions: {
        serverTask: {
          id: "serverTask",
          componentId: "Page",
          taskId: "task-1",
          placement: "server",
          stateContract: {
            reads: [{ path: "project.id", kind: "read", confidence: "exact" }],
            writes: [{ path: "project.title", kind: "write", confidence: "exact" }]
          }
        },
        sharedTask: { id: "sharedTask", componentId: "Page", taskId: "task-2", placement: "isomorphic" },
        clientTask: { id: "clientTask", componentId: "Widget", taskId: "task-3", placement: "client" }
      },
      components: [
        { id: "Page", placement: "server" },
        { id: "Widget", placement: "client" }
      ],
      boundaries: [
        { id: "client-widget-boundary", name: "Widget", componentId: "Widget", kind: "client-island" },
        { id: "client-widget-boundary:children", name: "Widget:children", componentId: "Widget", kind: "server-slot" }
      ]
    }, { endpoint: "/__exact" });

    expect(manifest).toEqual({
      version: 1,
      endpoint: "/__exact",
      actions: {
        serverTask: {
          id: "serverTask",
          componentId: "Page",
          taskId: "task-1",
          placement: "server",
          stateContract: {
            reads: [{ path: "project.id", kind: "read", confidence: "exact" }],
            writes: [{ path: "project.title", kind: "write", confidence: "exact" }]
          }
        },
        sharedTask: { id: "sharedTask", componentId: "Page", taskId: "task-2", placement: "isomorphic" }
      },
      boundaries: {
        "client-widget-boundary": {
          id: "client-widget-boundary",
          name: "Widget",
          componentId: "Widget",
          kind: "client-island"
        },
        "client-widget-boundary:children": {
          id: "client-widget-boundary:children",
          name: "Widget:children",
          componentId: "Widget",
          kind: "server-slot"
        },
        Page: { id: "Page", componentId: "Page" }
      }
    });

    expect(createExactHydrationStateContracts(manifest)).toEqual({
      serverTask: {
        reads: [{ path: "project.id", kind: "read", confidence: "exact" }],
        writes: [{ path: "project.title", kind: "write", confidence: "exact" }]
      }
    });
  });

  it("merges runtime allowlists from multiple compiler manifests", () => {
    const manifest = createExactServerManifest([
      {
        version: 1,
        serverActions: {
          pageTask: { id: "pageTask", componentId: "Page", taskId: "task-1", placement: "server" }
        },
        components: [{ id: "Page", placement: "server" }],
        boundaries: [{ id: "page-widget", name: "Widget", componentId: "Widget", kind: "client-island" }]
      },
      {
        version: 1,
        serverActions: {
          panelTask: { id: "panelTask", componentId: "Panel", taskId: "task-2", placement: "isomorphic" },
          clientOnly: { id: "clientOnly", componentId: "ClientOnly", taskId: "task-3", placement: "client" }
        },
        components: [{ id: "Panel", placement: "isomorphic" }, { id: "ClientOnly", placement: "client" }]
      }
    ], {
      boundaries: {
        "page-widget": { id: "page-widget", name: "AppWidgetOverride" }
      }
    });

    expect(manifest.actions).toEqual({
      pageTask: { id: "pageTask", componentId: "Page", taskId: "task-1", placement: "server" },
      panelTask: { id: "panelTask", componentId: "Panel", taskId: "task-2", placement: "isomorphic" }
    });
    expect(manifest.boundaries).toEqual({
      "page-widget": { id: "page-widget", name: "AppWidgetOverride" },
      Page: { id: "Page", componentId: "Page" },
      Panel: { id: "Panel", componentId: "Panel" }
    });
  });

  it("dispatches only manifest-allowlisted actions", async () => {
    const allowed = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action", payload: { title: "Ready" } }
    }, context());

    expect(allowed.status).toBe(200);
    expect(JSON.parse(allowed.body)).toMatchObject({
      ok: true,
      patches: [{ type: "text", id: "title", value: "Ready" }]
    });

    const denied = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "../server/private", payload: {} }
    }, context());

    expect(denied.status).toBe(404);
    expect(JSON.parse(denied.body)).toEqual({ error: "not_found" });
  });

  it("accepts action boundary snapshots only for manifest-allowlisted boundaries", async () => {
    let received: unknown;
    const allowed = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        boundaryHtmls: {
          "allowed-boundary": "<p>Current</p>"
        }
      }
    }, context({
      actions: {
        "allowed-action": input => {
          received = input.boundaryHtmls;
          return {};
        }
      }
    }));

    expect(allowed.status).toBe(200);
    expect(received).toEqual({
      "allowed-boundary": "<p>Current</p>"
    });

    const denied = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        boundaryHtmls: {
          "../private": "<p>Nope</p>"
        }
      }
    }, context());

    expect(denied.status).toBe(400);
    expect(JSON.parse(denied.body)).toEqual({ error: "bad_request" });
  });

  it("rejects action requests missing exact state contract reads", async () => {
    const withState = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        payload: { title: "Ready" },
        state: { project: { id: "p1" } }
      }
    }, context({
      manifest: {
        version: 1,
        actions: {
          "allowed-action": {
            id: "allowed-action",
            placement: "server",
            stateContract: {
              reads: [{ path: "project.id", kind: "read", confidence: "exact" }]
            }
          }
        }
      }
    }));
    expect(withState.status).toBe(200);

    const missingState = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action", state: { project: {} } }
    }, context({
      manifest: {
        version: 1,
        actions: {
          "allowed-action": {
            id: "allowed-action",
            placement: "server",
            stateContract: {
              reads: [{ path: "project.id", kind: "read", confidence: "exact" }]
            }
          }
        }
      }
    }));

    expect(missingState.status).toBe(400);
    expect(JSON.parse(missingState.body)).toEqual({ error: "bad_request" });
  });

  it("does not dispatch allowlisted ids without registered server handlers", async () => {
    const result = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({ actions: {} }));

    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "not_found" });
  });

  it("enforces authorization and csrf hooks before dispatch", async () => {
    const action = vi.fn();
    const result = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: { "allowed-action": action },
      authorize: () => true,
      validateCsrf: () => false
    }));

    expect(result.status).toBe(403);
    expect(action).not.toHaveBeenCalled();
  });

  it("rejects requests outside the configured endpoint", async () => {
    const action = vi.fn();
    const result = await handleExactRequest({
      method: "POST",
      url: "/wrong",
      body: { type: "action", id: "allowed-action" }
    }, context({
      manifest: {
        version: 1,
        endpoint: "/__exact",
        actions: {
          "allowed-action": { id: "allowed-action", placement: "server" }
        }
      },
      actions: { "allowed-action": action }
    }));

    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "not_found" });
    expect(action).not.toHaveBeenCalled();
  });

  it("rejects malformed and non-json-safe payloads", async () => {
    const malformed = await handleExactRequest({
      method: "POST",
      body: "{"
    }, context());

    expect(malformed.status).toBe(400);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const unsafe = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action", payload: cyclic }
    }, context());

    expect(unsafe.status).toBe(400);
  });

  it("rejects invocation requests with unknown protocol fields", async () => {
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        module: "../server/private"
      }
    }, context());

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "bad_request" });
  });

  it("rejects malformed invocation results before returning them to clients", async () => {
    const result = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: {
        "allowed-action": () => ({
          patches: [{ type: "replace", id: 1, html: "<p>bad</p>" } as any]
        })
      }
    }));

    expect(result.status).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: "internal_error" });
  });

  it("rejects invocation results and patches with unknown protocol fields", async () => {
    const extraResult = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: {
        "allowed-action": () => ({
          patches: [],
          module: "../server/private"
        } as any)
      }
    }));

    expect(extraResult.status).toBe(500);

    const extraPatch = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: {
        "allowed-action": () => ({
          patches: [{ type: "replace", id: "panel", html: "<p />", module: "../server/private" } as any]
        })
      }
    }));

    expect(extraPatch.status).toBe(500);
  });

  it("refreshes only manifest-allowlisted boundaries", async () => {
    const result = await handleExactRequest({
      method: "POST",
      body: { type: "refresh", id: "allowed-boundary" }
    }, context());

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      ok: true,
      patches: [{ type: "replace", id: "allowed-boundary", html: "<section>Updated</section>" }]
    });
  });

  it("dispatches batched operations with independent ordered results", async () => {
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "batch",
        version: 1,
        operations: [
          { type: "action", id: "allowed-action", payload: { title: "Ready" } },
          { type: "refresh", id: "allowed-boundary" },
          { type: "action", id: "missing-action" }
        ]
      }
    }, context());

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      ok: true,
      version: 1,
      results: [
        {
          ok: true,
          type: "action",
          id: "allowed-action",
          patches: [{ type: "text", id: "title", value: "Ready" }]
        },
        {
          ok: true,
          type: "refresh",
          id: "allowed-boundary",
          patches: [{ type: "replace", id: "allowed-boundary", html: "<section>Updated</section>" }]
        },
        {
          ok: false,
          type: "action",
          id: "missing-action",
          status: 404,
          error: "not_found"
        }
      ]
    });
  });

  it("rejects malformed batch envelopes before dispatch", async () => {
    const action = vi.fn();
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "batch",
        operations: [{ type: "action", id: "allowed-action" }],
        module: "../server/private"
      }
    }, context({
      actions: {
        "allowed-action": action
      }
    }));

    expect(result.status).toBe(400);
    expect(action).not.toHaveBeenCalled();
  });

  it("rejects unauthorized batches before dispatch", async () => {
    const action = vi.fn();
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "batch",
        operations: [{ type: "action", id: "allowed-action" }]
      }
    }, context({
      actions: {
        "allowed-action": action
      },
      authorize: (_request, input) => input.type !== "batch"
    }));

    expect(result.status).toBe(403);
    expect(action).not.toHaveBeenCalled();
  });

  it("passes boundary html snapshots to refresh handlers", async () => {
    const refresh = vi.fn(input => ({
      patches: [{ type: "replace" as const, id: "allowed-boundary", html: String(input.boundaryHtml ?? "") }]
    }));
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "refresh",
        id: "allowed-boundary",
        boundaryHtml: "<p>Previous</p>"
      }
    }, context({
      refreshBoundaries: {
        "allowed-boundary": refresh
      }
    }));

    expect(result.status).toBe(200);
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({
      boundaryHtml: "<p>Previous</p>"
    }), expect.any(Object));
  });

  it("dispatches through fetch-compatible adapters", async () => {
    const handler = createFetchHandler(context());
    const response = await handler(new Request("https://app.test/__exact", {
      method: "POST",
      body: JSON.stringify({ type: "action", id: "allowed-action", payload: { title: "Fetch" } }),
      headers: { "content-type": "application/json" }
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      patches: [{ type: "text", id: "title", value: "Fetch" }]
    });
  });

  it("dispatches through express-style adapters", async () => {
    const sent = new Promise<{ status: number; headers: Record<string, string>; body: string }>(resolve => {
      const headers: Record<string, string> = {};
      createExpressHandler(context())({
        method: "POST",
        url: "/__exact",
        body: { type: "action", id: "allowed-action", payload: { title: "Express" } },
        headers: {}
      }, {
        statusCode: 200,
        status(value: number) {
          this.statusCode = value;
          return this;
        },
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
        send(body: string) {
          resolve({ status: this.statusCode, headers, body });
        }
      });
    });

    const response = await sent;
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [{ type: "text", id: "title", value: "Express" }]
    });
  });

  it("dispatches through hapi-style adapters", async () => {
    const handler = createHapiHandler(context());
    const response = await handler({
      method: "POST",
      url: { path: "/__exact" },
      headers: {},
      payload: { type: "action", id: "allowed-action", payload: { title: "Hapi" } }
    }, {
      response(body: string) {
        return {
          body,
          statusCode: 200,
          code(value: number) {
            this.statusCode = value;
            return this;
          },
          header() {
            return this;
          }
        };
      }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [{ type: "text", id: "title", value: "Hapi" }]
    });
  });
});
