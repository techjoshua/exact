import { describe, expect, it, vi } from "vitest";
import {
  createExactHydrationActionBoundaries,
  createExactHydrationManifestConfig,
  createExactHydrationStateContracts,
  createExactServerManifest,
  createExpressHandler,
  createFetchHandler,
  createHapiHandler,
  handleExactRequest,
  type ExactExpressResponse,
  type ExactHapiResponse,
  type ExactHapiToolkit,
  type ExactServerContext
} from "./index.js";
import { dispatchExactBatch } from "./streaming.js";

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

async function readStreamEvents(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const reader = stream.getReader();
  return readRemainingStreamEvents(reader);
}

async function readRemainingStreamEvents(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<unknown[]> {
  const events: unknown[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) return events;
    const text = new TextDecoder().decode(next.value);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) events.push(JSON.parse(line));
    }
  }
}

async function readNextStreamLine(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const next = await reader.read();
  if (next.done) throw new Error("stream ended");
  return new TextDecoder().decode(next.value).trim();
}

describe("@exact/server", () => {
  it("rejects unsupported compiler manifest versions", () => {
    expect(() => createExactServerManifest({
      version: 1,
      components: []
    } as any)).toThrow("Unsupported eXact compiler manifest version: 1");
  });

  it("rejects malformed compiler manifests before creating allowlists", () => {
    expect(() => createExactServerManifest({
      version: 2,
      serverActions: {
        action: {
          id: 1,
          placement: "server"
        }
      }
    } as any)).toThrow("Malformed eXact compiler manifest");

    expect(() => createExactServerManifest({
      version: 2,
      components: [{ id: "Panel", placement: "browser" }]
    } as any)).toThrow("Malformed eXact compiler manifest");

    expect(() => createExactServerManifest({
      version: 2,
      serverActions: {
        action: {
          id: "action",
          placement: "server",
          stateContract: {
            reads: [{ path: "project.id", kind: "inspect", confidence: "exact" }]
          }
        }
      }
    } as any)).toThrow("Malformed eXact compiler manifest");

    expect(() => createExactServerManifest({
      version: 2,
      boundaries: [{
        id: "panel",
        renderEdgeIndex: 0
      }]
    } as any)).toThrow("Malformed eXact compiler manifest");

    expect(() => createExactServerManifest({
      version: 2,
      serverActions: {
        action: {
          id: "action",
          placement: "server",
          contextContract: [{ token: "AuthContext", kind: "inspect", confidence: "exact" }]
        }
      }
    } as any)).toThrow("Malformed eXact compiler manifest");
  });

  it("rejects malformed endpoint route maps", () => {
    expect(() => createExactServerManifest({
      version: 2,
      components: []
    }, {
      endpoints: {
        actions: {
          save: 1
        }
      } as any
    })).toThrow("Malformed eXact endpoint routes");

    expect(() => createExactServerManifest({
      version: 2,
      components: []
    }, {
      endpoints: {
        boundaries: ["remote"]
      } as any
    })).toThrow("Malformed eXact endpoint routes");
  });

  it("creates runtime allowlists from compiler manifests", () => {
    const manifest = createExactServerManifest({
      version: 2,
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
        { id: "client-widget-boundary", name: "Widget", componentId: "Widget", ownerComponentId: "Page", kind: "client-island" },
        { id: "client-widget-boundary:children", name: "Widget:children", componentId: "Widget", ownerComponentId: "Page", kind: "server-slot" }
      ]
    }, {
      endpoint: "/__exact",
      endpoints: {
        actions: {
          sharedTask: "https://remote.test/__exact"
        },
        boundaries: {
          "client-widget-boundary": "https://remote.test/__exact"
        }
      }
    });

    expect(manifest).toEqual({
      version: 1,
      endpoint: "/__exact",
      endpoints: {
        actions: {
          sharedTask: "https://remote.test/__exact"
        },
        boundaries: {
          "client-widget-boundary": "https://remote.test/__exact"
        }
      },
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
          ownerComponentId: "Page",
          kind: "client-island"
        },
        "client-widget-boundary:children": {
          id: "client-widget-boundary:children",
          name: "Widget:children",
          componentId: "Widget",
          ownerComponentId: "Page",
          kind: "server-slot"
        },
        Page: { id: "Page", componentId: "Page" }
      },
      actionBoundaries: {
        serverTask: ["Page", "client-widget-boundary", "client-widget-boundary:children"],
        sharedTask: ["Page", "client-widget-boundary", "client-widget-boundary:children"]
      }
    });

    expect(createExactHydrationStateContracts(manifest)).toEqual({
      serverTask: {
        reads: [{ path: "project.id", kind: "read", confidence: "exact" }],
        writes: [{ path: "project.title", kind: "write", confidence: "exact" }]
      }
    });
    expect(createExactHydrationActionBoundaries(manifest)).toEqual({
      serverTask: ["Page", "client-widget-boundary", "client-widget-boundary:children"],
      sharedTask: ["Page", "client-widget-boundary", "client-widget-boundary:children"]
    });
    expect(createExactHydrationManifestConfig(manifest, { project: { id: "p1" } })).toEqual({
      endpoint: "/__exact",
      endpoints: {
        actions: {
          sharedTask: "https://remote.test/__exact"
        },
        boundaries: {
          "client-widget-boundary": "https://remote.test/__exact"
        }
      },
      state: { project: { id: "p1" } },
      stateContracts: {
        serverTask: {
          reads: [{ path: "project.id", kind: "read", confidence: "exact" }],
          writes: [{ path: "project.title", kind: "write", confidence: "exact" }]
        }
      },
      actionBoundaries: {
        serverTask: ["Page", "client-widget-boundary", "client-widget-boundary:children"],
        sharedTask: ["Page", "client-widget-boundary", "client-widget-boundary:children"]
      }
    });
  });

  it("omits empty endpoint route maps from hydration config", () => {
    const manifest = createExactServerManifest({
      version: 2,
      components: [{ id: "Page", placement: "server" }]
    }, {
      endpoint: "/__exact",
      endpoints: {
        actions: {},
        boundaries: {}
      }
    });

    expect(manifest.endpoints).toBeUndefined();
    expect(createExactHydrationManifestConfig(manifest)).toEqual({
      endpoint: "/__exact"
    });
  });

  it("merges runtime allowlists from multiple compiler manifests", () => {
    const manifest = createExactServerManifest([
      {
        version: 2,
        serverActions: {
          pageTask: {
            id: "pageTask",
            componentId: "Page",
            taskId: "task-1",
            placement: "server",
            contextContract: [{ token: "AuthContext", kind: "read", confidence: "exact" }]
          }
        },
        components: [{ id: "Page", placement: "server" }],
        boundaries: [{ id: "page-widget", name: "Widget", componentId: "Widget", kind: "client-island" }]
      },
      {
        version: 2,
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
      pageTask: {
        id: "pageTask",
        componentId: "Page",
        taskId: "task-1",
        placement: "server",
        contextContract: [{ token: "AuthContext", kind: "read", confidence: "exact" }]
      },
      panelTask: { id: "panelTask", componentId: "Panel", taskId: "task-2", placement: "isomorphic" }
    });
    expect(manifest.boundaries).toEqual({
      "page-widget": { id: "page-widget", name: "AppWidgetOverride" },
      Page: { id: "Page", componentId: "Page" },
      Panel: { id: "Panel", componentId: "Panel" }
    });
    expect(manifest.actionBoundaries).toEqual({
      pageTask: ["Page"],
      panelTask: ["Panel"]
    });
  });

  it("rejects conflicting action ids across compiler manifests", () => {
    expect(() => createExactServerManifest([
      {
        version: 2,
        serverActions: {
          save: { id: "save", componentId: "Page", taskId: "task-1", placement: "server" }
        }
      },
      {
        version: 2,
        serverActions: {
          save: { id: "save", componentId: "Panel", taskId: "task-2", placement: "server" }
        }
      }
    ])).toThrow("Conflicting eXact action id in compiler manifests: save");
  });

  it("accepts equivalent action contracts independent of object key order", () => {
    const base = {
      id: "save",
      componentId: "Page",
      taskId: "task-1",
      placement: "server" as const,
      stateContract: { reads: [{ path: "project.id", kind: "read" as const, confidence: "exact" as const }] }
    };
    expect(() => createExactServerManifest([
      { version: 2, serverActions: { save: base } },
      {
        version: 2,
        serverActions: {
          save: {
            placement: "server",
            taskId: "task-1",
            componentId: "Page",
            id: "save",
            stateContract: { reads: [{ confidence: "exact", kind: "read", path: "project.id" }] }
          }
        }
      }
    ])).not.toThrow();
  });

  it("rejects conflicting boundary ids across compiler manifests", () => {
    expect(() => createExactServerManifest([
      {
        version: 2,
        boundaries: [{ id: "shared-boundary", componentId: "Page", kind: "client-island" }]
      },
      {
        version: 2,
        boundaries: [{ id: "shared-boundary", componentId: "Panel", kind: "client-island" }]
      }
    ])).toThrow("Conflicting eXact boundary id in compiler manifests: shared-boundary");
  });

  it("keeps explicit app boundary overrides while rejecting accidental manifest collisions", () => {
    const manifest = createExactServerManifest([
      {
        version: 2,
        boundaries: [{ id: "remote-widget", componentId: "Widget", kind: "client-island" }]
      },
      {
        version: 2,
        boundaries: [{ id: "remote-widget", componentId: "OtherWidget", kind: "client-island" }]
      }
    ], {
      boundaries: {
        "remote-widget": { id: "remote-widget", name: "AppOwnedRemoteWidget" }
      }
    });

    expect(manifest.boundaries?.["remote-widget"]).toEqual({
      id: "remote-widget",
      name: "AppOwnedRemoteWidget"
    });
  });

  it("merges app-provided action allowlists with compiler manifests", () => {
    const manifest = createExactServerManifest({
      version: 2,
      components: [{ id: "Profile", placement: "isomorphic" }],
      boundaries: [
        { id: "profile-client", componentId: "ClientWidget", ownerComponentId: "Profile", kind: "client-island" }
      ]
    }, {
      actions: {
        "save-profile": { id: "save-profile", componentId: "Profile", placement: "server" }
      }
    });

    expect(manifest.actions).toEqual({
      "save-profile": { id: "save-profile", componentId: "Profile", placement: "server" }
    });
    expect(manifest.actionBoundaries).toEqual({
      "save-profile": ["Profile", "profile-client"]
    });
  });

  it("preserves compiler boundary render edge metadata", () => {
    const manifest = createExactServerManifest({
      version: 2,
      components: [{ id: "Page", placement: "server" }],
      boundaries: [{
        id: "page-widget",
        name: "Widget",
        componentId: "Widget",
        ownerComponentId: "Page",
        renderEdgeId: "edge-1",
        renderEdgeIndex: 1,
        renderPath: "3.0.1",
        kind: "client-island"
      }]
    });

    expect(manifest.boundaries?.["page-widget"]).toEqual({
      id: "page-widget",
      name: "Widget",
      componentId: "Widget",
      ownerComponentId: "Page",
      renderEdgeId: "edge-1",
      renderEdgeIndex: 1,
      renderPath: "3.0.1",
      kind: "client-island"
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

  it("rejects action boundary snapshots outside the action boundary contract", async () => {
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        boundaryHtmls: {
          "other-boundary": "<p>Other</p>"
        }
      }
    }, context({
      manifest: {
        version: 1,
        actions: {
          "allowed-action": { id: "allowed-action", placement: "server" }
        },
        boundaries: {
          "allowed-boundary": { id: "allowed-boundary" },
          "other-boundary": { id: "other-boundary" }
        },
        actionBoundaries: {
          "allowed-action": ["allowed-boundary"]
        }
      }
    }));

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "bad_request" });
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

  it("accepts exact state contract reads through array paths", async () => {
    const withState = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        payload: { title: "Ready" },
        state: { projects: [{ id: "p1" }] }
      }
    }, context({
      manifest: {
        version: 1,
        actions: {
          "allowed-action": {
            id: "allowed-action",
            placement: "server",
            stateContract: {
              reads: [{ path: "projects.0.id", kind: "read", confidence: "exact" }]
            }
          }
        }
      }
    }));
    expect(withState.status).toBe(200);

    const missingState = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        payload: { title: "Ready" },
        state: { projects: [] }
      }
    }, context({
      manifest: {
        version: 1,
        actions: {
          "allowed-action": {
            id: "allowed-action",
            placement: "server",
            stateContract: {
              reads: [{ path: "projects.0.id", kind: "read", confidence: "exact" }]
            }
          }
        }
      }
    }));
    expect(missingState.status).toBe(400);
  });

  it("validates serialized context against action context contracts", async () => {
    const action = vi.fn(input => ({
      state: { user: (input.context as Record<string, unknown>).AuthContext }
    }));
    const exactContext = context({
      manifest: {
        version: 1,
        actions: {
          "allowed-action": {
            id: "allowed-action",
            placement: "server",
            contextContract: [
              { token: "AuthContext", kind: "read", confidence: "exact" },
              { token: "ThemeContext", kind: "write", confidence: "exact" }
            ]
          }
        }
      },
      actions: {
        "allowed-action": action
      }
    });

    const accepted = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        context: {
          AuthContext: { id: "u1" },
          ThemeContext: "dark"
        }
      }
    }, exactContext);

    expect(accepted.status).toBe(200);
    expect(JSON.parse(accepted.body)).toMatchObject({
      ok: true,
      state: { user: { id: "u1" } }
    });
    expect(action).toHaveBeenCalledOnce();

    const missing = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        context: {
          ThemeContext: "dark"
        }
      }
    }, exactContext);
    expect(missing.status).toBe(400);
    expect(JSON.parse(missing.body)).toEqual({ error: "bad_request" });

    const unknown = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        context: {
          AuthContext: { id: "u1" },
          SecretContext: "nope"
        }
      }
    }, exactContext);
    expect(unknown.status).toBe(400);
    expect(JSON.parse(unknown.body)).toEqual({ error: "bad_request" });
  });

  it("rejects serialized context when no action context contract allows it", async () => {
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        context: {
          AuthContext: { id: "u1" }
        }
      }
    }, context());

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "bad_request" });
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

  it("runs security hooks once for single operation requests", async () => {
    const authorize = vi.fn(() => true);
    const validateCsrf = vi.fn(() => true);
    const result = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action", payload: { title: "Ready" } }
    }, context({
      authorize,
      validateCsrf
    }));

    expect(result.status).toBe(200);
    expect(authorize).toHaveBeenCalledOnce();
    expect(validateCsrf).toHaveBeenCalledOnce();
  });

  it("fails closed when authorization or csrf hooks throw", async () => {
    const authAction = vi.fn();
    const authResult = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: { "allowed-action": authAction },
      authorize: () => {
        throw new Error("auth store unavailable");
      }
    }));

    expect(authResult.status).toBe(403);
    expect(JSON.parse(authResult.body)).toEqual({ error: "forbidden" });
    expect(authAction).not.toHaveBeenCalled();

    const csrfAction = vi.fn();
    const csrfResult = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: { "allowed-action": csrfAction },
      validateCsrf: () => {
        throw new Error("csrf store unavailable");
      }
    }));

    expect(csrfResult.status).toBe(403);
    expect(JSON.parse(csrfResult.body)).toEqual({ error: "forbidden" });
    expect(csrfAction).not.toHaveBeenCalled();
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

  it("rejects malformed single boundary snapshots", async () => {
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "refresh",
        id: "allowed-boundary",
        boundaryHtml: { html: "<p>Previous</p>" }
      }
    }, context());

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "bad_request" });
  });

  it("normalizes undefined optional request fields like JSON transport", async () => {
    const action = vi.fn((input: { type: string; id: string }) => ({ patches: [] }));
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "allowed-action",
        opId: undefined,
        dependsOn: undefined,
        payload: undefined,
        state: undefined,
        boundaryHtml: undefined,
        boundaryHtmls: undefined
      }
    }, context({
      actions: { "allowed-action": action }
    }));

    expect(result.status).toBe(200);
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0][0]).toEqual({
      type: "action",
      id: "allowed-action"
    });
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

  it("rejects undefined invocation result fields that would disappear during JSON serialization", async () => {
    const undefinedState = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: {
        "allowed-action": () => ({ state: undefined })
      }
    }));

    expect(undefinedState.status).toBe(500);
    expect(JSON.parse(undefinedState.body)).toEqual({ error: "internal_error" });

    const undefinedPropPatch = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: {
        "allowed-action": () => ({
          patches: [{ type: "prop", id: "panel", name: "title", value: undefined } as any]
        })
      }
    }));

    expect(undefinedPropPatch.status).toBe(500);
    expect(JSON.parse(undefinedPropPatch.body)).toEqual({ error: "internal_error" });

    const undefinedStatePatch = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: {
        "allowed-action": () => ({
          patches: [{ type: "state", id: "panel", value: undefined } as any]
        })
      }
    }));

    expect(undefinedStatePatch.status).toBe(500);
    expect(JSON.parse(undefinedStatePatch.body)).toEqual({ error: "internal_error" });
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

  it("streams single operation results as ndjson events", async () => {
    const result = await handleExactRequest({
      method: "POST",
      headers: { accept: "application/x-ndjson" },
      body: { type: "refresh", id: "allowed-boundary" }
    }, context());

    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");
    expect(await readStreamEvents(result.stream!)).toEqual([
      { event: "start", version: 1, operations: 1 },
      {
        event: "patch",
        version: 1,
        index: 0,
        type: "refresh",
        id: "allowed-boundary",
        patch: { type: "replace", id: "allowed-boundary", html: "<section>Updated</section>" }
      },
      {
        event: "result",
        version: 1,
        index: 0,
        result: { ok: true, type: "refresh", id: "allowed-boundary" }
      },
      { event: "complete", version: 1 }
    ]);
  });

  it("aborts dispatched work when the response stream reader is cancelled", async () => {
    let started!: () => void;
    const didStart = new Promise<void>(resolve => { started = resolve; });
    let observedAbort = false;
    const result = await handleExactRequest({
      method: "POST",
      headers: { accept: "application/x-ndjson" },
      body: { type: "action", id: "allowed-action" }
    }, context({
      actions: {
        "allowed-action": (_input, requestContext) => new Promise(resolve => {
          started();
          requestContext.signal?.addEventListener("abort", () => {
            observedAbort = true;
            resolve({});
          }, { once: true });
        })
      }
    }));
    const reader = result.stream!.getReader();
    expect(JSON.parse(await readNextStreamLine(reader))).toMatchObject({ event: "start" });
    await didStart;
    await reader.cancel("client disconnected");
    expect(observedAbort).toBe(true);
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

  it("runs independent batch operations concurrently while preserving result order", async () => {
    const started: string[] = [];
    let resolveSlow!: () => void;
    const slow = new Promise<void>(resolve => {
      resolveSlow = resolve;
    });

    const pending = handleExactRequest({
      method: "POST",
      body: {
        type: "batch",
        operations: [
          { type: "action", id: "allowed-action", opId: "slow" },
          { type: "refresh", id: "allowed-boundary", opId: "fast" }
        ]
      }
    }, context({
      actions: {
        "allowed-action": async () => {
          started.push("slow");
          await slow;
          return { state: { slow: true } };
        }
      },
      refreshBoundaries: {
        "allowed-boundary": () => {
          started.push("fast");
          return { state: { fast: true } };
        }
      }
    }));

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(started).toEqual(["slow", "fast"]);
    resolveSlow();

    const result = await pending;
    expect(JSON.parse(result.body)).toMatchObject({
      ok: true,
      version: 1,
      results: [
        { ok: true, type: "action", id: "allowed-action", opId: "slow", state: { slow: true } },
        { ok: true, type: "refresh", id: "allowed-boundary", opId: "fast", state: { fast: true } }
      ]
    });
  });

  it("aborts and drains sibling batch work when dispatch rejects", async () => {
    let siblingAborted = false;
    let siblingSettled = false;
    const request = { method: "POST" };
    const operations = [
      { type: "action" as const, id: "fail", opId: "fail" },
      { type: "action" as const, id: "sibling", opId: "sibling" }
    ];
    await expect(dispatchExactBatch(request, operations, context(), async (ownedRequest, operation) => {
      if (operation.id === "fail") throw new Error("dispatch failed");
      return await new Promise(resolve => {
        ownedRequest.signal!.addEventListener("abort", () => {
          siblingAborted = true;
          siblingSettled = true;
          resolve({ ok: false, type: operation.type, id: operation.id, status: 499, error: "internal_error" });
        }, { once: true });
      });
    })).rejects.toThrow("dispatch failed");
    expect(siblingAborted).toBe(true);
    expect(siblingSettled).toBe(true);
  });

  it("rejects oversized batches and bounds dispatch concurrency", async () => {
    const rejected = await handleExactRequest({
      method: "POST",
      body: { type: "batch", operations: [{ type: "action", id: "allowed-action" }, { type: "action", id: "allowed-action" }] }
    }, context({ limits: { maxBatchOperations: 1 } }));
    expect(rejected.status).toBe(400);

    let active = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pending = handleExactRequest({
      method: "POST",
      body: { type: "batch", operations: Array.from({ length: 6 }, (_, index) => ({ type: "action", id: "allowed-action", opId: `op-${index}` })) }
    }, context({
      limits: { maxBatchConcurrency: 2 },
      actions: {
        "allowed-action": async () => {
          active++;
          peak = Math.max(peak, active);
          await gate;
          active--;
          return {};
        }
      }
    }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(active).toBe(2);
    release();
    expect((await pending).status).toBe(200);
    expect(peak).toBe(2);
  });

  it("enforces request graph and non-stream response budgets", async () => {
    const deep: Record<string, any> = {};
    let cursor = deep;
    for (let index = 0; index < 150; index++) cursor = cursor.next = {};
    const rejectedRequest = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action", payload: deep }
    }, context());
    expect(rejectedRequest.status).toBe(400);

    const rejectedResponse = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action" }
    }, context({
      limits: { maxResponseBytes: 64 },
      actions: { "allowed-action": () => ({ html: "x".repeat(1_000) }) }
    }));
    expect(rejectedResponse.status).toBe(500);
    expect(JSON.parse(rejectedResponse.body)).toEqual({ error: "internal_error" });
  });

  it("does not dispatch streamed work ahead of consumer demand", async () => {
    const action = vi.fn(() => ({ patches: [
      { type: "text" as const, id: "a", value: "A" },
      { type: "text" as const, id: "b", value: "B" }
    ] }));
    const response = await handleExactRequest({
      method: "POST",
      headers: { accept: "application/x-ndjson" },
      body: { type: "action", id: "allowed-action" }
    }, context({ actions: { "allowed-action": action } }));
    await Promise.resolve();
    expect(action).not.toHaveBeenCalled();
    const reader = response.stream!.getReader();
    expect(JSON.parse(await readNextStreamLine(reader))).toMatchObject({ event: "start" });
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);
    await reader.cancel();
  });

  it("enforces stream byte budgets and validates payloads without invoking accessors", async () => {
    const oversized = await handleExactRequest({
      method: "POST",
      headers: { accept: "application/x-ndjson" },
      body: { type: "action", id: "allowed-action" }
    }, context({
      limits: { maxStreamBytes: 80 },
      actions: { "allowed-action": () => ({ html: "x".repeat(1_000) }) }
    }));
    const reader = oversized.stream!.getReader();
    expect(JSON.parse(await readNextStreamLine(reader))).toMatchObject({ event: "start" });
    await expect(reader.read()).rejects.toThrow("byte limit");

    let reads = 0;
    const payload = Object.create(Object.prototype);
    Object.defineProperty(payload, "danger", { enumerable: true, get() { reads++; return "value"; } });
    const rejected = await handleExactRequest({
      method: "POST",
      body: { type: "action", id: "allowed-action", payload }
    }, context());
    expect(rejected.status).toBe(400);
    expect(reads).toBe(0);
  });

  it("streams independent batch results as each operation settles", async () => {
    let resolveSlow!: () => void;
    const slow = new Promise<void>(resolve => {
      resolveSlow = resolve;
    });

    const result = await handleExactRequest({
      method: "POST",
      headers: { "x-exact-stream": "1" },
      body: {
        type: "batch",
        operations: [
          { type: "action", id: "allowed-action", opId: "slow" },
          { type: "refresh", id: "allowed-boundary", opId: "fast" }
        ]
      }
    }, context({
      actions: {
        "allowed-action": async () => {
          await slow;
          return { state: { slow: true } };
        }
      },
      refreshBoundaries: {
        "allowed-boundary": () => ({ state: { fast: true } })
      }
    }));

    const reader = result.stream!.getReader();
    const first = JSON.parse(await readNextStreamLine(reader));
    const fastState = JSON.parse(await readNextStreamLine(reader));
    const fastResult = JSON.parse(await readNextStreamLine(reader));
    expect(first).toEqual({ event: "start", version: 1, operations: 2 });
    expect(fastState).toMatchObject({
      event: "state",
      version: 1,
      index: 1,
      type: "refresh",
      id: "allowed-boundary",
      opId: "fast",
      value: { fast: true }
    });
    expect(fastResult).toMatchObject({
      event: "result",
      version: 1,
      index: 1,
      result: { ok: true, type: "refresh", id: "allowed-boundary", opId: "fast" }
    });

    resolveSlow();
    const remaining = await readRemainingStreamEvents(reader);
    expect(remaining).toEqual([
      {
        event: "state",
        version: 1,
        index: 0,
        type: "action",
        id: "allowed-action",
        opId: "slow",
        value: { slow: true }
      },
      {
        event: "result",
        version: 1,
        index: 0,
        result: { ok: true, type: "action", id: "allowed-action", opId: "slow" }
      },
      { event: "complete", version: 1 }
    ]);
  });

  it("skips dependent batch operations when prerequisites fail", async () => {
    const refresh = vi.fn();
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "batch",
        operations: [
          { type: "action", id: "missing-action", opId: "save" },
          { type: "refresh", id: "allowed-boundary", opId: "refresh", dependsOn: ["save"] }
        ]
      }
    }, context({
      refreshBoundaries: {
        "allowed-boundary": refresh
      }
    }));

    expect(result.status).toBe(200);
    expect(refresh).not.toHaveBeenCalled();
    expect(JSON.parse(result.body)).toEqual({
      ok: true,
      version: 1,
      results: [
        {
          ok: false,
          type: "action",
          id: "missing-action",
          opId: "save",
          status: 404,
          error: "not_found"
        },
        {
          ok: false,
          type: "refresh",
          id: "allowed-boundary",
          opId: "refresh",
          status: 424,
          error: "dependency_failed"
        }
      ]
    });
  });

  it("runs dependent batch operations after successful prerequisites", async () => {
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "batch",
        operations: [
          { type: "action", id: "allowed-action", opId: "save", payload: { title: "Ready" } },
          { type: "refresh", id: "allowed-boundary", opId: "refresh", dependsOn: ["save"] }
        ]
      }
    }, context());

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      ok: true,
      version: 1,
      results: [
        {
          ok: true,
          type: "action",
          id: "allowed-action",
          opId: "save"
        },
        {
          ok: true,
          type: "refresh",
          id: "allowed-boundary",
          opId: "refresh"
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

  it("rejects duplicate batch operation ids before dispatch", async () => {
    const action = vi.fn();
    const result = await handleExactRequest({
      method: "POST",
      body: {
        type: "batch",
        operations: [
          { type: "action", id: "allowed-action", opId: "save" },
          { type: "action", id: "allowed-action", opId: "save" }
        ]
      }
    }, context({
      actions: {
        "allowed-action": action
      }
    }));

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "bad_request" });
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

  it("preserves zero-prefetch demand through fetch stream wrappers", async () => {
    const action = vi.fn(() => ({}));
    const handler = createFetchHandler(context({ actions: { "allowed-action": action } }));
    const response = await handler(new Request("https://app.test/__exact", {
      method: "POST",
      body: JSON.stringify({ type: "action", id: "allowed-action" }),
      headers: { "content-type": "application/json", accept: "application/x-ndjson" }
    }));
    await Promise.resolve();
    expect(action).not.toHaveBeenCalled();
    const reader = response.body!.getReader();
    expect(JSON.parse(new TextDecoder().decode((await reader.read()).value))).toMatchObject({ event: "start" });
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);
    await reader.cancel();
  });

  it("dispatches through express-style adapters", async () => {
    const sent = new Promise<{ status: number; headers: Record<string, string>; body: string }>(resolve => {
      const headers: Record<string, string> = {};
      type TestExpressResponse = ExactExpressResponse & { statusCode: number };
      const expressResponse: TestExpressResponse = {
        statusCode: 200,
        status(value: number) {
          this.statusCode = value;
          return this;
        },
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
        send(body: unknown) {
          resolve({ status: this.statusCode, headers, body: String(body) });
        }
      };

      createExpressHandler(context())({
        method: "POST",
        url: "/__exact",
        body: { type: "action", id: "allowed-action", payload: { title: "Express" } },
        headers: {}
      }, expressResponse);
    });

    const response = await sent;
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [{ type: "text", id: "title", value: "Express" }]
    });
  });

  it("turns express disconnect events into request cancellation", async () => {
    const upstream = new AbortController();
    let disconnect!: () => void;
    let started!: () => void;
    const didStart = new Promise<void>(resolve => { started = resolve; });
    let observedAbort = false;
    const finished = new Promise<void>(resolve => {
      createExpressHandler(context({
        actions: {
          "allowed-action": (_input, requestContext) => new Promise(actionResolve => {
            started();
            requestContext.signal?.addEventListener("abort", () => {
              observedAbort = true;
              actionResolve({});
            }, { once: true });
          })
        }
      }))({
        method: "POST",
        url: "/__exact",
        headers: { accept: "application/x-ndjson" },
        body: { type: "action", id: "allowed-action" },
        signal: upstream.signal,
        once(event, listener) { if (event === "aborted") disconnect = listener; },
        off() {}
      }, {
        status() { return this; },
        setHeader() {},
        write() {},
        end() { resolve(); },
        send() { resolve(); },
        destroy() { resolve(); },
        once() {},
        off() {}
      });
    });

    await didStart;
    disconnect();
    await finished;
    expect(observedAbort).toBe(true);
  });

  it("waits for Express drain before reading more streamed output", async () => {
    const listeners = new Map<string, () => void>();
    const writes: Uint8Array[] = [];
    let ended!: () => void;
    const complete = new Promise<void>(resolve => { ended = resolve; });
    createExpressHandler(context())({
      method: "POST",
      url: "/__exact",
      headers: { accept: "application/x-ndjson" },
      body: { type: "action", id: "allowed-action" }
    }, {
      status() { return this; },
      setHeader() {},
      write(chunk) {
        writes.push(chunk);
        return writes.length !== 1;
      },
      end() { ended(); },
      send() { ended(); },
      destroy(error) { throw error; },
      once(event, listener) { listeners.set(event, listener); },
      off(event) { listeners.delete(event); }
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(writes).toHaveLength(1);
    listeners.get("drain")?.();
    await complete;
    expect(writes.length).toBeGreaterThan(1);
  });

  it("dispatches through hapi-style adapters", async () => {
    type TestHapiResponse = ExactHapiResponse & {
      body: string;
      statusCode: number;
    };
    const toolkit: ExactHapiToolkit<TestHapiResponse> = {
      response(body: unknown) {
        return {
          code(status: number): TestHapiResponse {
            return {
              body: String(body),
              statusCode: status,
              header() {
                return this;
              }
            };
          }
        };
      }
    };
    const handler = createHapiHandler<TestHapiResponse>(context());
    const response = await handler({
      method: "POST",
      url: { path: "/__exact" },
      headers: {},
      payload: { type: "action", id: "allowed-action", payload: { title: "Hapi" } }
    }, toolkit);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [{ type: "text", id: "title", value: "Hapi" }]
    });
  });
});
