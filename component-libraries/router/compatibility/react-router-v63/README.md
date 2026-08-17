# React Router 6.3 compatibility fixture

This private fixture keeps eXact's React Router 6.3 API compatibility testable without installing
the historical router version in the main workspace dependency graph. Run it through
`npm run test:router-v63` from the repository root.

The fixture is test-only and must not be published, deployed, or used to process untrusted traffic.
