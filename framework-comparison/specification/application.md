# Incident operations application contract

The comparison application is a collaborative incident-operations console. An authenticated responder opens
a queue, inspects incidents, claims work, comments, starts server analysis, observes progress, and handles
changes made by another user. The domain is compact enough to reproduce while exercising meaningful browser,
server, and ownership behavior.

## Required experience

Every complete participant provides:

- an authenticated, server-renderable queue with status and severity filters;
- a deep-linkable incident detail view;
- accessible loading, empty, error, conflict, and retry states;
- optimistic incident claiming with authoritative rollback on a version conflict;
- comment submission with validation and duplicate-submission protection;
- a server analysis operation with queued, running, completed, and failed presentation;
- live queue/detail synchronization when an incident changes in another session;
- stable focus and selection across updates; and
- usable keyboard navigation at the same viewport breakpoints.

Implementations may differ in DOM structure, component boundaries, routing library, cache, rendering strategy,
or transport plumbing. Visible copy in scenario-targeted controls, accessible names, URLs, and business outcomes
are contractual because the same black-box tests must drive every participant.

## Domain invariants

- Incident `version` begins at one and advances exactly once for every accepted mutation.
- A claim supplies `expectedVersion`. A stale version returns the current incident without applying the claim.
- Only a fixture user may claim an incident or author a comment.
- Closed incidents cannot be claimed.
- Empty comments and comments longer than 2,000 Unicode code points are rejected.
- Starting analysis creates a distinct job owned by the incident. Completion may update analysis output but does
  not advance the incident version.
- Participant-specific server code in the native track must preserve these invariants.

## Contract stability

[`scenarios.json`](scenarios.json) is the machine-readable catalog. Scenario IDs and settlement assertions are
versioned contracts. New behavior increments `schemaVersion` when an older participant cannot satisfy it without
a source change. Cosmetic refinements that preserve selectors and outcomes do not require a version increment.
