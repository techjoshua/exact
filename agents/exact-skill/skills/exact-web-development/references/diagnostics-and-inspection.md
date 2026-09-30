# Diagnose source and running behavior

When a component behaves unexpectedly, first identify what evidence is missing. Compiler diagnostics
explain whether the source is supported and how work is placed. Runtime inspection shows the state,
task generations, and dependencies of an actual mounted instance. Neither replaces a behavioral test.
Read the relevant installed package's `AGENTS.md`, README, and declarations before using these APIs.

## Explain a compiler decision

Start with the application's check script or its installed compiler:

```sh
npx --no-install exactc --check --project tsconfig.json
```

Record the diagnostic code, file, source span, and explanation. Inspect the operation named in the
message and its caller. For example, a reevaluation diagnostic may concern an opaque helper's effects,
not the type of its returned value. A purity annotation requires evidence that the helper is safe to
reevaluate. A cast does not establish that property.

If the agent harness already provides an LSP client, it can connect to the installed
`exact-language-server --stdio`. Follow the installed `@exactjs/language-server` README for setup.
Initialize semantic execution only for a trusted workspace, with
`initializationOptions.workspaceTrusted: true`. Synchronize the document through standard
`textDocument/didOpen` and `textDocument/didChange` notifications before requesting explanations.
Use increasing document versions and disregard results for superseded text.

| Question | LSP request and params |
| --- | --- |
| Did the workspace resolve the intended compiler and providers? | `exact/projectStatus` with `{ "textDocument": { "uri": "file:///absolute/path/Counter.tsx" } }` |
| What regions, tasks, dependencies, and placements did the compiler find? | `exact/componentSemantics` with the same params |
| Why does one returned entity have that meaning? | `exact/explainEntity` with the same params plus `"entityId"` from the inspection |

Read standard published diagnostics alongside these explanations. Ordinary TypeScript language
support continues to own general type checking and navigation. The eXact server supplies framework
semantics. A missing provider or untrusted workspace is incomplete inspection, not evidence of a
clean component.

Without an LSP client, the CLI check is still useful. For deeper scripted inspection, the installed
`@exactjs/compiler` README describes `createExactLanguageService({ root, noEmit: true })`, document
synchronization, and `inspect()`. Dispose the service in `finally`. Do not write a second compiler
classifier or guess placement from emitted JavaScript. Diagnostic entity IDs are local to their
inspection and cannot substitute for runtime identities.

## Inspect a running instance

When checking why a displayed value or task has stalled, use the existing application's development
inspection setup. [runtime-configuration.md](runtime-configuration.md#optional-full-stack-devtools)
explains the separate configuration and authorization boundaries. Do not enable production inspection
just to compensate for missing development instrumentation.

For agent automation, `@exactjs/devtools-agent` connects to an existing Chromium target through CDP.
Its installed README contains a connection and bounded query example. The target page must already
expose the eXact DevTools hook. Keep the target explicit when several applications are open.

1. Query `session.describe` and `roots.list` to establish the session, available capabilities, and
   roots. Check that the source/build under investigation matches the running application.
2. Query `components.tree` within the selected root, then `components.get` for the relevant instance.
   Carry the returned identity into subsequent requests. Do not select an instance by its name alone.
3. Choose `state.get` for the current value, `tasks.list` and `tasks.get` for task status,
   `dependencies.explain` for an update relationship, or `errors.list` for captured failures.
   Consult the installed protocol declarations for each method's identity and result requirements.
4. Bound collection queries with `params.page.limit`. Follow returned cursors only as needed.
   Capture the failing transition through supported subscriptions or `timeline.query` when a final
   state alone would hide a cancelled or superseded task.
5. Close subscriptions and disconnect in `finally`. Navigation or session expiration requires fresh
   identities. Do not reuse an old instance ID against a new session.

These queries are read-only. They cannot invoke tasks, mutate state, evaluate arbitrary page
JavaScript, or widen redaction. A `not-authorized` or `unavailable` response means that evidence
could not be obtained. It is different from a successful empty result. Source excerpts also require
their own authorization and matching source identity.

## Turn evidence into verification

After correcting the responsible source or framework boundary, rerun the original check and a test
that observes the failing transition. For a task, that may mean asserting pending state, replacement,
and the final result. For hydration, check the server output and the same interaction after adoption.
Report the command, actual assertions or diagnostic result, and any environment that could not be
verified. An inspection screenshot or a successful build alone does not prove interaction behavior.
