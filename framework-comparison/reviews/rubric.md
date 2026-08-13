# Framework-specialist review rubric

A participant cannot become `complete` or contribute to a publishable measurement until a reviewer with
current production experience in that framework approves it. The reviewer should examine source and run the
shared acceptance suite, then record actionable findings in the participant's `review.json`.

Approval confirms that:

- state, component ownership, forms, routing, SSR, hydration, and server interaction use framework-native
  facilities rather than patterns copied from another participant;
- lifecycle cleanup, cancellation, optimistic state, conflict recovery, and live synchronization are correct;
- module boundaries and naming make the implementation maintainable without hiding complexity in shared UI;
- framework-specific production optimization is enabled where it preserves the application contract;
- accessibility and keyboard behavior match the shared observable tests; and
- any deliberate deviation or unresolved limitation is recorded for the result report.

Review identity and date are evidence, not an endorsement by the framework project. Historical findings stay
in version control so corrections are visible rather than silently rewriting prior results.
