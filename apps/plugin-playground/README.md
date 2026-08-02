# Plugin playground

A practical eXact gallery showing how optional renderer enhancements improve familiar controls:

- motion adds continuity to tabs, disclosure, toast presence, and replacement panels;
- gestures recognizes press, hover/focus intent, long press, drag and keyboard sliders, and
  pan/pinch media navigation;
- physics owns a fixed-step, directly manipulated body with playful bounded collisions; and
- gravity contributes a deliberately lively force through physics context.

The final stage composes all four packages on one intrinsic target. Physical ceiling and side
walls keep the high-restitution orb recoverable, and an explicit reset remains available after
aggressive dragging or repeated launches. Each example keeps application state authoritative and
labels the package responsible for each behavior.

Run `npm run dev --workspace @exactjs/sample-plugin-playground` for the interactive sample or
`npm run build --workspace @exactjs/sample-plugin-playground` to verify attributed-import catalog
generation and bundling.
