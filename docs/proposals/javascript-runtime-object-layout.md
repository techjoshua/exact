# JavaScript runtime object-layout optimization

Status: investigation plan. This document records directional V8 measurements
and the work justified by them. It is not a commitment to V8-specific behavior.

## Goal

Reduce allocation cost, retained heap, hidden-class transitions, and
megamorphic property access in the JavaScript runtime while preserving:

- setup-once, inspectable component instances;
- behavior in non-V8 JavaScript engines;
- public own-property behavior unless deliberately changed;
- compact server wire formats; and
- lifecycle cleanup and ownership guarantees.

Object layout is not intrinsically faster when it is more uniform. Extra
properties consume memory and can reduce cache locality. Every change therefore
needs workload and heap evidence rather than a hidden-class assertion alone.

## Initial evidence

Measurements were taken on Node 24.11.1/V8 on Windows using
`--allow-natives-syntax` for map and fast-property inspection and
`--expose-gc` for directional allocation measurements. Synthetic loops used
250,000 renderer or VNode records and 50,000 component shells. These numbers
rank experiments; they are not release baselines.

### Component instances

Framework-created component instances report dictionary properties rather than
V8 fast properties. `createComponentInstance()` currently constructs a large
object literal containing public state, lifecycle collections, accessors, and
per-instance method closures.

A synthetic shell with the same broad structure compared as follows:

| Layout                                     | Approximate bytes per shell | Repeated read/call loop |
| ------------------------------------------ | --------------------------: | ----------------------: |
| Large object literal with own closures     |                     3,537 B |              190–242 ms |
| Class fields with shared prototype methods |                       872 B |                57–70 ms |

The absolute values include synthetic functions and are not expected to match
real components. The large and repeatable direction, together with the real
instance being in dictionary mode, justifies a production-shaped prototype.

Task registrations did not show the same problem. They retained fast properties
and a common map after ordinary startup, so eager padding or class conversion is
not currently justified for tasks.

### Mounted renderer records

A mixed DOM tree containing host nodes, text, a component, Fragment, Dynamic,
Portal, Activity, Suspense, and unsafe HTML produced seven `Mounted` maps. The
three common maps were:

- host: base fields plus `afterPlacement`;
- text/dynamic: base fields plus `stop` and `afterPlacement`; and
- component: base fields plus `instance` and `afterPlacement`.

Synthetic access across a representative distribution showed the tradeoff:

| Layout                                             | Approximate bytes per record | Repeated read loop |
| -------------------------------------------------- | ---------------------------: | -----------------: |
| Current sparse variants                            |                        106 B |         155–159 ms |
| Common hot header with remaining sparse variants   |                        138 B |         112–121 ms |
| Every optional `Mounted` field eagerly initialized |                        206 B |         118–123 ms |

Full padding is not worth pursuing: it nearly doubled record memory and was no
faster than the partial header. A narrow common header may be useful, but only
if real DOM mounting, patching, teardown, and retained-heap measurements justify
the added slots.

### VNodes

Ordinary, domain-bearing, and text VNodes currently use different maps, but all
retain V8 fast properties. A canonical five-field synthetic VNode used roughly
8 B more per VNode and did not improve the repeated read loop:

| Layout                         | Approximate bytes per VNode | Repeated read loop |
| ------------------------------ | --------------------------: | -----------------: |
| Current compact variants       |                        96 B |           22–30 ms |
| Canonical `key`/`domain` slots |                       104 B |           25–29 ms |

Canonical VNode padding should not proceed. It also changes observable
own-property behavior. The existing removal of delete-based JSX prop
normalization remains worthwhile because it avoids a transition without padding
the resulting VNode.

### Roots and server records

Renderer roots have several shapes, but they are few and long-lived. Server
patch and protocol objects often use conditional spreads, but many are
serialized once rather than repeatedly accessed hot records. Compact wire
objects should not be padded. These areas remain lower priority unless profiling
identifies a specific hot internal record.

## Recommended work

### 1. Establish production-shaped measurement

Add an opt-in object-layout benchmark that measures:

- creation and disposal of large component populations;
- retained heap after repeated component mount/unmount cycles;
- component API and state access through compiled application code;
- mixed-tree mount, patch, Activity park/unpark, and teardown;
- keyed-list workloads already covered by the DOM benchmark; and
- at least one current Chromium build in addition to Node.

V8 map inspection may be an optional diagnostic mode, but release gates must use
portable elapsed-time and heap measurements. Record medians across separate
processes so optimized state and garbage collection from one candidate do not
contaminate another.

### 2. Prototype a class-backed component instance

Replace the large object-literal construction internally with a
`ComponentInstanceImpl` class or equivalent shared prototype:

- keep state, props, contexts, tasks, lifecycle collections, ownership, and
  cancellation visible as coherent instance fields;
- move stable component API methods and accessors to the prototype;
- move current closure locals into explicit instance fields or one inspectable
  internal lifecycle record;
- retain per-instance callable values only where the API requires them, such as
  the task facet and component logger;
- preserve setup-once component invocation with the instance as `this`; and
- decide explicitly whether extracting an unbound method is supported before
  changing the current closure-method behavior.

Proceed to implementation only if the production-shaped prototype:

- keeps component instances in fast-property mode on supported V8 versions;
- reduces component-population retained heap by at least 20%;
- improves component creation/lifecycle workload median by at least 10%; and
- does not regress representative DOM update workloads by more than 3%.

This is the highest-priority experiment.

### 3. Prototype only a dominant `Mounted` header

Do not initialize every optional field. Test a renderer-owned constructor that
gives the dominant host, text/dynamic, and component records the same ordered
header, initially limited to:

- `vnode`;
- `dom`;
- `scope`;
- `children`;
- `instance`;
- `stop`; and
- `afterPlacement`.

Range ends, portals, raw nodes, Activity, and Suspense state should remain
variant-specific or move behind an explicit variant record only when that
reduces total memory. Compare this with an alternative that keeps the current
compact records but splits generic teardown and placement paths by mounted kind,
allowing each hot function to see fewer maps.

Accept a layout only if mixed-tree and keyed-list benchmarks improve by at least
5%, teardown improves or remains neutral, and retained heap grows by no more
than 10%. Prefer specialized code paths over extra per-node slots when their
performance is comparable.

### 4. Stop unless profiling finds another target

Do not currently:

- canonicalize or pad VNodes;
- convert or pad task registrations;
- normalize the shapes of renderer roots;
- pad serialized server protocol or patch objects; or
- change public record layouts solely to satisfy `%HaveSameMap`.

After the component and narrow `Mounted` experiments, repeat whole-framework
profiles. Further layout work should require a named hot call site and evidence
of polymorphic or dictionary-property cost there.

## Test and rollout requirements

The component prototype must retain lifecycle ordering, error handling, task
ownership, context lookup, refs, reparenting, Activity transitions, resumption,
and construction-failure cleanup tests. Add a repeated mount/unmount heap
plateau test without asserting engine-specific byte counts.

The `Mounted` experiment must retain semantic DOM identity, portal ownership,
retained Activity ranges, Suspense candidates, refs, direct and delegated event
cleanup, unsafe HTML teardown, hydration adoption, and deep iterative teardown.

Land the two experiments separately. Each commit should contain its focused
benchmark evidence so either optimization can be reverted independently if a
future engine changes the tradeoff.
