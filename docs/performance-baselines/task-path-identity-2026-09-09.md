# Task path identity prerequisite for SSR span planning

Date: 2026-09-09. Compiler characterization; production unchanged.

The previous turn completed a wrapper-removal recheck. This investigation returns to the shared
renderer requirement: publish independent document regions before waiting for dependent tasks.
The hypothesis was that structured compiler reads could be matched against existing task write
effects. Five compiler cases and 15 assertions demonstrate why the current flattened effect labels
cannot serve as that identity.

| Source | Read representation | Task write representation | Result |
| --- | --- | --- | --- |
| `state["page.title"]` | `["page.title"]` | `"page.title"` | Accepted |
| `state.page.title` | `["page", "title"]` | `"page.title"` | Accepted |
| Both writes in one task | Both distinct read paths | One `"page.title"` effect | Accepted, effects collapse |
| `state.page["*"]` | `["page", "*"]`, broad | `"page.*"`, broad | Rejected with EXACT2001 |
| `state.page[props.field]` read | `["page", "*"]`, broad | Concrete title write | Accepted |

The first two properties are distinct JavaScript state locations. Splitting the write label on
dots would incorrectly classify the literal dotted property. Joining the read path instead loses
precision by merging distinct locations. The combined case confirms information is lost during
effect deduplication, not only in diagnostic formatting. A literal star is currently treated as a
broad computed path; this rejected case must not be represented as supported behavior in a planner.

Source tracing identifies the flattening in `taskWriteEffects` and `taskReadEffects` in `tasks.go`,
and direct callable effect collection in `callable_direct_effects.go`. `StateEffect` carries only
a string path. `uniqueStateEffects` uses that string, kind, operation, and receiver for deduplication.
Adding a matcher after deduplication cannot recover the lost distinction.

The next implementation must retain structured path identity before callable propagation and
deduplication, including receiver identity and uncertainty. Exact key segments and unknown computed
segments need distinct representations. A display label can remain a label, but the new SSR planner
must not parse it as a protocol. Transitive helper effects must preserve the same representation;
fixing direct task writes alone is insufficient. Effect completeness and state escaping remain
separate proof obligations described in the earlier task-span-effects audit.

This is evidence against a proposed optimization shortcut, not a reproduced stale-document bug.
The cases were compiled, not executed as SSR requests. Component-wide waiting remains unchanged.
No new throughput improvement, early head publication, package validation, or browser result is
claimed. Public documentation needs no update because no public behavior changed.

Run `.tmp/ssr-large-profile/task-path-identity-audit.mjs` from the repository root with the current
native compiler. It sends newline-delimited requests, closes stdin, and waits for compiler exit.
The adjacent evidence ZIP contains source inputs, full compiler responses, assertions, compiler
SHA-256, relevant compiler source snapshots, and a verified SHA-256 manifest. The broader goal
remains incomplete.
