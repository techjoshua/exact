# @exactjs/agent-skill

Portable guidance for coding agents that build eXact applications.

## Installation model

The package contains the `exact-web-development` skill under `skills/`. Agent harnesses do not
universally discover skills inside `node_modules`, so expose or copy that directory into the
harness's recognized skill location.

`@exactjs/create-exact-app` can install the skill into
`.agents/skills/exact-web-development`, keeping it versioned with a generated application.

The skill reads concise package-local `AGENTS.md` files for package-specific usage and package
READMEs for human-readable setup and examples.
