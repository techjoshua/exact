# @exactjs/agent-skill

Portable instructions that teach Agent Skills-compatible coding agents how to build idiomatic
eXact applications.

The package contains the `exact-web-development` skill under `skills/`. Installing this npm
package makes the versioned skill files available, but coding agents do not universally discover
skills inside `node_modules`. Expose or copy the skill directory into the location recognized by
the developer's agent harness.
