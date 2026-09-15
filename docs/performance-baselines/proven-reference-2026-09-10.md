# Proven private props in reference construction, September 10, 2026

Status: retained metadata-normalization shortcut after rebuilt and HTTP comparisons. The separate reference-layout experiment is rejected.

Source tracing found that the retained scalar-prop proof excludes reserved metadata, but ordinary reference construction still reads key/enhancement fields, unwraps/coerces keys, and checks own reserved fields. Hypothesis: reusing the first private-bag proof to omit that normalization could improve large trees by 1-3%. Reused invocations and inherited reserved metadata keep the ordinary path. Scalar validation, component domain, reference branding, contract identity, and hydration representation remain intact. No second renderer is introduced.

The artifact experiment adds a dedicated plain-reference constructor behind the existing proof. Seventy-two fresh production processes compare retained/candidate/React on Node/Bun, small/large and string/encoded/stream, in two reversed orders. Each warms 5,000 renders and measures 10,000. All eXact document hashes match. Encoded includes Response construction and full text consumption. Values are mean microseconds per render, lower is better.

| Runtime | Mode    | Document | Retained | Candidate |  React |
| ------- | ------- | -------- | -------: | --------: | -----: |
| node    | string  | assets   |    33.02 |     32.94 |  21.82 |
| node    | string  | large    |   165.05 |    157.30 | 128.19 |
| node    | encoded | assets   |    51.03 |     49.67 |  32.65 |
| node    | encoded | large    |   198.98 |    189.80 | 182.20 |
| node    | stream  | assets   |    53.55 |     54.05 |  67.96 |
| node    | stream  | large    |   192.72 |    187.07 | 332.58 |
| bun     | string  | assets   |    37.18 |     37.33 |  32.19 |
| bun     | string  | large    |   211.92 |    205.70 | 185.77 |
| bun     | encoded | assets   |    39.78 |     38.48 |  38.35 |
| bun     | encoded | large    |   213.01 |    223.84 | 206.25 |
| bun     | stream  | assets   |    53.70 |     52.49 |  52.19 |
| bun     | stream  | large    |   287.82 |    285.54 | 265.19 |

Node large strings and encoded responses improve in both orders. Bun large strings improve, but large encoded responses regress. This is mixed evidence, not acceptance. The artifact includes test-only exports of the operations and child component; real package builds omit them. Rebuilt measurements must therefore be considered separately.

## Provisional source contract

Core provides createPreparedServerComponentReferenceFromPlainProps for a complete fresh private data bag with no own or inherited reserved metadata. It retains the same component contract, props, shared empty children, and current domain. The SSR caller requires a declared proof field, absence of inherited key/enhancement metadata, and no prior issuance attempt. It then records the same scalar proof attempt as before, including unsuccessful scalar checks. Reused or potentially exposed inputs use ordinary normalization.

The compiler-emitted signature and artifact representation do not change. The core helper is linked by the SSR runtime, not emitted into application artifacts. Frozen fixtures must remain unchanged. Engineering guidance in docs/ssr-hydration.md marks this follow-up as experimental. No public application API change is proposed.

Focused reference tests pass. An added core-domain test initially omitted its required executionRoot option; test typechecking caught it, and the fixture was corrected to page. Broader package/browser validation and final benchmark results follow below.

## Rebuilt implementation validation

The SSR TypeScript build and core target rebuild pass. The real application was rebuilt without prototype-only exports and includes the new core factory and shared first-attempt predicate. Test typechecking, 359 core/SSR/compiler tests across 57 files, 56 browser checks across Node/Bun string/stream, targeted ESLint, frozen compiled ABI verification, platform boundaries, and package-content checks pass. The core domain regression verifies retained domain, props identity, reference branding, and empty children. SSR regression coverage verifies both successful and failed first scalar attempts, later key normalization, and inherited metadata.

Canonical comparison applications contain the retained implementation. Rebuilt performance measurements are separate from the prototype. Public charts retain their prior full benchmark baseline; these focused captures do not replace a full suite.

## Rebuilt measurements

Same 72-process matrix as the prototype. These numbers measure the actual package integration, with no test-only exports. All eXact full-document hashes match.

| Runtime | Mode    | Document | Retained | Integrated |  React |
| ------- | ------- | -------- | -------: | ---------: | -----: |
| node    | string  | assets   |    33.15 |      33.07 |  22.13 |
| node    | string  | large    |   163.42 |     157.08 | 130.51 |
| node    | encoded | assets   |    50.26 |      50.73 |  33.16 |
| node    | encoded | large    |   199.80 |     195.07 | 179.53 |
| node    | stream  | assets   |    53.66 |      53.31 |  66.55 |
| node    | stream  | large    |   186.87 |     189.36 | 338.71 |
| bun     | string  | assets   |    36.77 |      37.08 |  31.48 |
| bun     | string  | large    |   207.86 |     209.46 | 185.98 |
| bun     | encoded | assets   |    38.28 |      37.85 |  37.71 |
| bun     | encoded | large    |   215.91 |     218.60 | 198.47 |
| bun     | stream  | assets   |    54.08 |      53.54 |  52.26 |
| bun     | stream  | large    |   287.74 |     288.69 | 264.37 |

The robust direction is narrower than the prototype suggested: Node large strings improve, while Bun is broadly neutral or mixed. Node large streams are slightly slower in this capture. HTTP confirmation is recorded separately; no percentages from successive experiments should be added.

## Reference object layout: rejected follow-up

An isolated Node V8 DebugPrint check showed the computed brand first plus a subsequently assigned domain using a PropertyArray. Named fields before the computed brand avoided that array in a five-field toy object. The first check was incomplete: adding the scalar proof afterward restores a PropertyArray in both layouts. The candidate then has five in-object fields rather than four as well as the same three-slot property array. This invalidates the proposed allocation saving for a full reference. The raw partial and complete layout checks are preserved.

Sixteen fresh production processes compare retained, integrated, named-fields-first and React on large strings in reversed orders. All eXact hashes match.

| Runtime | Retained | Integrated | Layout candidate |  React |
| ------- | -------: | ---------: | ---------------: | -----: |
| node    |   163.24 |     158.60 |           160.49 | 131.18 |
| bun     |   205.70 |     205.67 |           213.34 | 182.78 |

The layout candidate is slower and rejected. It was never applied to production source. The integrated metadata shortcut repeats its Node large-string benefit in this comparison; Bun is approximately tied.

## Final HTTP comparison and retention decision

Two reversed orders per Node/Bun string/stream cell, concurrency 32 across two owned drivers, two seconds warmup and four seconds measured per population. Complete response identities are checked. All 24 populations completed with zero errors. Values are mean valid requests/s, higher is better.

| Runtime | Mode   | Before | Retained |  React | Change |
| ------- | ------ | -----: | -------: | -----: | -----: |
| node    | string | 7000.6 |   7096.0 | 9649.2 | +1.36% |
| node    | stream | 6245.0 |   6264.4 | 3946.6 | +0.31% |
| bun     | string | 8547.3 |   8744.9 | 9242.6 | +2.31% |
| bun     | stream | 6588.9 |   6654.9 | 6686.7 | +1.00% |

String throughput improves in both orders on both runtimes. Streaming is close to unchanged, with modest positive means. The helper is retained for the repeated Node large-string gain and these string HTTP results. Bun renderer-only results and the slight Node large-stream regression remain explicit limits on any broad performance claim. No minimum percentage threshold was imposed.

Source architecture, JSDoc contracts, and the explicit-any ratchet also pass. The overall React objective remains unmet: Node strings and Bun strings still trail React; Bun streaming is too close to claim a reliable lead. Source snapshots, frozen app artifacts, all raw captures and runners, validation logs, and rejected layout evidence are preserved in proven-reference-2026-09-10-evidence.zip.

Archive SHA-256: `38612d5e71768d7c964f10276da78367e74858cb8e2972a1d7166bcf04923dda`.
