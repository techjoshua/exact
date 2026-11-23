# Compiler audit handoff

The verified compiler checkpoint is `ef6398e93c1cbf3e635ea18ab192746a90ccdedd`. Resume from the recovery branch that contains this file. The active workload is the original **ThemeScope** component in [packages/theme/src/components.ts](packages/theme/src/components.ts). Its full client and server compilation and runtime verification are still open.

## Start on another computer

```sh
git clone --branch recovery/compiler-audit-ef6398e93 https://github.com/techjoshua/exact.git exact
cd exact
git switch -c work/resume-theme-compiler-audit
git branch -r --list 'origin/recovery/compiler-*'
git log -8 --oneline ef6398e93
```

Read the additional working guidance saved from the primary checkout. That checkout had a different base. Inspect the three-file delta before carrying relevant edits onto the working branch.

```sh
git show 284f841b3 -- AGENTS.md docs/compiler-architecture-completion-plan.md docs/component-composition-corpus.md
```

Use the repository's pinned toolchain and the [native compiler build instructions](native/typescript-go/README.md). The Go overlay builds in the pinned upstream module. Build the SDK and required workspace packages before running generated-artifact checks. Theme's maintained [package build](packages/theme/package.json) uses [compile-exact-package.mjs](scripts/compile-exact-package.mjs). Rebuild the compiler from the chosen Git revision on the new machine and verify the runner selects it. The previous machine's binaries, caches, guards, symlinks and scratch replay scripts are local.

## Audit method and stopping condition

Start at the original component request. Follow actual execution order. At each step establish what the component requires, what the compiler knows on its first visit, what it records or releases, and what the later consumer actually does. Fix the **first demonstrated discrepancy**, replay the same path from entry, verify observable behavior, then continue to the next discrepancy until the component is correctly and efficiently compiled. The architectural target is one full eXact traversal of authored syntax. Carry scope on descent and transfer the minimum needed facts on ascent. Keep invocation-specific decisions with their actual inputs. Consult the [traversal and persistence rules](docs/compiler-architecture-completion-plan.md#what-to-carry-during-ast-traversal) and the saved guidance delta above.

Use profiles to measure an identified discrepancy. A full-package timeout neither invalidates a verified local improvement nor establishes package latency or correctness. Preserve ordinary getters, evaluation order, component identity, placement, and portable client/server behavior. Parallelize independent source and fixture work. On the previous host overlapping native builds repeatedly exhausted memory, so native builds and heavy replays ran one at a time under a resource guard.

## Verified progress in the integration history

| Commit | Change and evidence |
| --- | --- |
| `365afc562` | Recorded lexical return expressions at the original source-index visit. The two copy helpers retained all five returns in order and avoided 158 and 95 body visitor callbacks per respective summary miss. Invocation-specific return selection stayed intact. |
| `5d8c16b03` | Reused enclosing module ownership and receiver annotation from candidate discovery. Ownership matched for all 48 candidates in the original two audited files. |
| `719d80cea` | Compile entry reuses the exact synchronized normalization when valid. JSX visitor callbacks fell from 2,540 to 1,270 for the measured original request. All 37 protocol controls matched, including source maps and diagnostics. |
| `cc4cdb8e4` | The three literal defaults in the original color.ts require zero policy import tables. Two genuine policy lookups share one table. Named/namespace imports and shadow refusal passed. |
| `8a784c821`, `ef6398e93` | Reused component name classification. Separately corrected the receiver tests to exercise supported component contracts. SSR, mounted lifecycle, Unicode names and lexical component controls passed. |

This branch also contains earlier qualified repairs for captured props, context task capture, function transport, optional-method receivers, inherited getters and setters, returned-object placement, and writer discovery. The accessor representation change at `c4ecaba70` reduced the result header from 872 to 752 bytes. The confined Map.set change at `7c92dc89a` removed 2,418 measured writer preparations even though the full Intl request timed out in both arms. See the commit history for individual scopes.

## Resume the interrupted work

1. Reproduce the original synchronization and compile sequence using the real Theme package sources and config. The retained sequence synchronized 20 inputs, with color.ts first and components.ts second, then compiled color.ts followed by components.ts. Record the actual request input hashes, compiler revision and both target responses on the new host. The last bounded replays emitted clean matching color.ts. No complete original components.ts pair was obtained.
2. The first pending candidate on the audited synchronization path is **protocol-member discovery**. Inspect `git show 1d578af25`. To qualify it independently from the checkpoint, use `git switch -c work/qualify-protocol origin/recovery/compiler-wip-protocol-ef6398e93`. It records the existing protocol syntax fact during discovery so canonical eligibility and the render planner can consume it on the same parse. A source model counted 70 repeated body searches and 7,210 node visits for color.ts. These are model counts. Native qualification was interrupted. The recovery branch contains the patch, focused Go tests and the owner fixture under testdata.
3. Check actual owner boundaries, including nested functions with their own receiver and arrows inheriting the outer receiver, parse refresh after edits, and an input where no later consumer requests the fact. Compare ordinary stock and candidate client/server responses, diagnostics, source maps, SSR and mounted behavior. Count both visits removed and extra work during original discovery. Preserve any distinct supplied-props eligibility rule. Re-run from request entry after a verified change.
4. The next supplied-props lead was a second inspection of formal names to rule out object destructuring. This investigation was interrupted before a verified patch. A receiver scan may stop before a later destructured parameter. Start from the original parameter visit when investigating it.
5. Once the original artifacts emit, exercise the maintained [Theme component tests](packages/theme/src/components.test.ts) and verify the whole component. The prior scratch oracle expected five bound artifacts and 13 checks, including the authored order and values of 165 CSS properties, tonic updates, preservation of input identity/value/focus, hydration adoption and updates, and disposal of the three registered preference listeners. Recreate missing scratch-only assertions against the authored behavior. Passing reduced fixtures does not establish these results.

## Other saved branches

The six WIP branches are independent recovery snapshots based on different revisions. Inspect their commit diffs and rebind one candidate at a time. They have not been qualified as a combined patch.

| Remote branch (all under `recovery/`) | Tip | Remaining work |
| --- | --- | --- |
| `compiler-wip-protocol-ef6398e93` | `1d578af25` | Active candidate described above. |
| `compiler-wip-suppliers-365afc562` | `3b5399d79` | Resolve the copy loop's append/supplier relationship when the source index closes. Measure index cost on used and unused loops, edit invalidation and reader parity. |
| `compiler-wip-summary-365afc562` | `633a4f0ab` | Avoid repeat summary visits to type syntax after a complete index. Finish refined emitted replay and preserve incomplete-index fallback. |
| `compiler-wip-casing-ef6398e93` | `8da391336` | Skip unnecessary checked JSX casing work. Verify foreign-JSX behavior, virtual suffixes and whether the pinned upstream subtree flag incurs a cold traversal. |
| `compiler-wip-renderer-context-ef6398e93` | `5082044f4` | Correct stale renderer context metadata after a definite replacement. Keep conditional, earlier, and independent same-token reads. The original setup lookup is genuine. |
| `compiler-wip-renderer-options-ef6398e93` | `547a42f45` | Correct the fixture's project/runtime setup and verify actual renderer option lowering, ordinary rendering and fallback. |

Two separate findings remain open. A snapshot task can receive an opaque accessor effect directly on its caller even when the helper resolves and the activation dependency is correct. Isolate the originating Get and retain a real getter control. The original IdentityProvider projection still lacked a generated resumption island; standalone hydration adopted correctly. Its per-use placement/publication contract needs separate architectural consideration.

Raw profiles, full logs, generated artifacts, and the exact scratch harnesses are outside Git. This document records the reproducible source checkpoints and the limits of the retained evidence. No pull request or release was opened for recovery.
