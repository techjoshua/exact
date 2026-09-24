# eXact component composition corpus

This private package validates native eXact component behavior across compiler specializations,
supported general paths, client updates, disposal, server rendering, streaming, and hydration.
Use it when changing compiler or runtime behavior that can differ between execution paths.

Run the complete suite from the repository root:

```sh
npm run test:composition-corpus
```

The compiler-path inventory and scenario catalog describe intended coverage. Behavioral tests
supply the evidence; generated-structure tests verify compiler contracts without whole-output
snapshots. `test:fast` runs only inventory and structure checks, not behavioral acceptance.

The owned report workbench executes shared repeated-interaction assertions through ordinary,
spread-based, and enhanced controls, both mounted and hydrated. Add small scenarios as new
failure classes emerge. It uses no external application's source or data.

See [the corpus reference](../../docs/component-composition-corpus.md) for the coverage map,
evidence boundaries, remaining gaps, and extension rules. The normal package test suite already
runs these tests in CI.
