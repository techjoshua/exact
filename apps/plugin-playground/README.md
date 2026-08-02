# Plugin playground

A focused eXact sample that composes all four optional renderer-enhancement packages on one
intrinsic target:

- motion owns enter and retained leave playback;
- gestures recognizes pointer drag and keyboard movement;
- physics owns the body, fixed-step world, collisions, and DOM projection; and
- gravity contributes force through the physics context exposed on the same target.

Run `npm run dev --workspace @exactjs/sample-plugin-playground` for the interactive sample or
`npm run build --workspace @exactjs/sample-plugin-playground` to verify attributed-import catalog
generation and bundling.
