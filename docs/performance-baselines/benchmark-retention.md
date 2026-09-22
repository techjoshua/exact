# Benchmark result retention

Git holds benchmark implementation, methodology, bounded result summaries, derived chart data,
and selected findings. Raw performance artifacts belong in ignored local output directories.
Do not commit bulk samples, traces, profiles, logs, copied sources, source-file hash inventories,
generated builds, evidence ZIPs, or generated metric tables in Markdown.

## Results and reproduction

Commit the measured implementation before an accepted performance run. Record the clean source
revision, resolved dependencies and lockfile identity, toolchain, hardware/OS, network configuration,
commands, warmup and sample counts, correctness outcomes, and limitations. A rebuild can reproduce
an implementation, not the exact timings of an earlier run. Dirty-worktree diagnostics must be
labeled explicitly; a SHA and dirty marker do not reconstruct an uncommitted prototype.

Update [results.json](results.json) in place for accepted framework comparisons. Git supplies the
history; do not append all prior runs or create a new dated report for each run. Preserve per-group
source identity and measurement dates when updating only part of a result. Failed or incomplete
diagnostics must not silently replace an accepted baseline. Keep failures and unfavorable metrics
visible in an accepted comparison rather than selecting only favorable observations.

The initial maintained results file is the unchanged September 22 full-run summary for clean
implementation `dd3d7e69b31d7fd638c1af015cce3e49e422573b`. Its historical input names and hashes
are provenance metadata, not downloadable raw captures or publisher inputs. Existing dated JSON
captures and ZIPs elsewhere in this directory are legacy material awaiting the separately planned
artifact/history cleanup; their presence is not permission to add more.

Public chart inputs in `apps/docs/src/data` are compact derived results and remain committed with
their own capture dates. Correctness fixtures, frozen release ABI artifacts, and machine-consumed
regression baselines are intentional test inputs, not an excuse to retain run artifacts. Do not
delete or regenerate them as a side effect of report cleanup.

## Findings and temporary evidence

Publish a finding only for a consequential investigation or decision. Keep work-in-progress notes
local, then write one distilled account with scope, source identity, conclusions, and limitations.
Findings under `docs/findings` are immutable; later evidence adds a linked correction or superseding
entry. Routine reruns update results rather than the journal. Current behavior belongs in maintained
references, not in historical findings.

Commit reusable measurement methods as harness source when needed for future comparisons. Do not
distribute private experiment directories as source archives. The [comparison commands](../../framework-comparison/README.md)
and [methodology](../../framework-comparison/methodology.md) describe maintained reproduction paths.
Temporary captures need bounded retention and producer-owned cleanup; archiving them in Git is not
a cleanup mechanism.

Removing a file from the checkout does not remove earlier blobs from Git. Historical expunging and
storage reclamation require the separate reviewed rewrite plan. Original prose remains recoverable
from Git history without a duplicate archive in the current tree.
