# Adversarial release audit, 2026-09-07

Scope: independent publication, package selection, ABI policy, staging paths, legal-notice checks,
and the dependency-audit gate. Findings were tested against the working tree containing the 0.5.0
release preparation. This is a release-tooling audit, not a comprehensive compiler or runtime
security assessment. No registry publication was executed.

## Findings and disposition

| Finding                                              | Impact and precondition                                                                                                                                                               | Disposition                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing dependency publication preflight             | A selected package could publish successfully while its required internal dependency versions were unavailable, leaving consumers unable to install it.                               | Fixed. Runtime, optional, and peer dependency ranges must resolve from registry versions or the selected release. Registry failures abort preflight. |
| Staging path containment checked only as text        | A directory junction or symlink below `.tmp` could redirect output replacement outside the intended temporary tree. Requires filesystem access or a preexisting redirected directory. | Fixed in npm and native package staging. Every existing output ancestor from `.tmp` onward must be a real directory.                                 |
| ABI fixture reference could change within an epoch   | Changing `introduced` without changing the epoch could redirect subsequent baseline comparisons. The existing check examined the previous fixture for only the current comparison.    | Fixed. A compatible epoch retains its original baseline, and empty provider lists are rejected.                                                      |
| Manual publication compared the checkout with itself | A manual workflow could skip meaningful ABI version comparison even though the check reported success.                                                                                | Fixed. Manual publication requires a prior revision through `abi_base`; comparing with the current commit is rejected.                               |
| Security audit accepted malformed reports            | With no exceptions, an npm error object lacking vulnerabilities could be interpreted as a clean audit. Invalid exception dates also bypassed expiration checks.                       | Fixed. Report shape, process completion, severity, exception dates, and duplicate exceptions are validated explicitly.                               |
| Low-severity comparison dependency finding           | npm reports `svelte-adapter-bun` 1.0.1 through `@sveltejs/kit` in `framework-comparison/node_modules`. The dependency belongs to the private comparison suite.                        | Open. `check:security-audit` fails for this unreviewed finding. No exception was added and no benchmark dependency was silently downgraded.          |

The publication planner also rejects a map entry whose archive manifest names a different package.
This protects the pure planner boundary in addition to the command's archive indexing checks.
The workflow previously omitted `check:security-audit` from artifact admission. It now runs that
check before staging release artifacts, so the open finding blocks CI publication until reviewed.

## Reproduction and regression coverage

- Before the fix, `planNpmPublication()` accepted a Forms-only selection requiring unpublished
  `@exactjs/core@^0.5.0`. Tests now exercise unavailable, incompatible, published, and selected
  dependencies in every consumer dependency section, plus registry failures and malformed replies.
- A temporary directory junction pointed from `.tmp/redirect` to a directory containing a sentinel.
  `assertReleaseOutput()` rejects a child output through that junction and preserves the sentinel.
  It also rejects `.tmp` itself, escaping paths, and file ancestors.
- `validateAbiRelease()` previously accepted changing the fixture baseline from 0.5.0 to 0.6.0
  while retaining epoch 1. A regression test rejects this and empty provider lists.
- Security-report tests cover transport errors, missing report fields, invalid and expired dates,
  severity escalation, duplicate exceptions, and stale exceptions.

All 111 build-script tests pass. The 19 focused release and audit tests also pass with their source
modules copied to an isolated directory containing no workspace package outputs; they use only
Node built-ins and the installed `semver` dependency. The live npm audit produced the open finding
above, rather than a clean result.
All 52 existing targeted server-security, SSR document-security, and component authorization tests
pass. Frozen compiled-artifact compatibility, documentation type checking, JSDoc, and source
architecture checks pass. A real Forms-only publication preview rejects its unavailable
`@exactjs/component-library@^0.5.0` dependency before any publication.

## Remaining boundaries

Publication is not transactional. Registry availability may change after preflight, and a failed
publication can leave a partial release. Existing versions are skipped on a rerun.

The staging path guard assumes no concurrent filesystem mutation. It is not protection against
a hostile process swapping directories between validation and deletion.

ABI schema checks and preserved artifacts do not prove all possible runtime semantics compatible.
Semantic changes with unchanged schema numbers still require review. The explicit manual baseline
must be the relevant prior release, not an arbitrary older commit chosen to weaken comparisons.

The cross-platform CI matrix and installation of the full release outside the monorepo remain
separate release checks. The private comparison dependency finding needs a reviewed remediation
or a specifically justified, time-limited exception before the dependency-audit gate is green.
