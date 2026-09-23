# @exactjs/agent-skill

Portable guidance for coding agents that build eXact applications.

## Installation model

The package contains the `exact-web-development` skill under `skills/`. Agent harnesses do not
universally discover skills inside `node_modules`, so expose or copy that directory into the
harness's recognized skill location.

`@exactjs/create-exact-app` can install the skill into
`.agents/skills/exact-web-development`, keeping it versioned with a generated application.

## Claude Code

Claude Code discovers project skills under `.claude/skills/` and supports symlinked skill directories
(see its [skill installation guidance](https://code.claude.com/docs/en/skills#choose-where-skills-load)).
Keep the generated `.agents` copy as the canonical payload and expose it from the repository root:

```sh
mkdir -p .claude/skills
ln -s ../../.agents/skills/exact-web-development .claude/skills/exact-web-development
```

If the generated app lives at `apps/web`, use
`../../apps/web/.agents/skills/exact-web-development` as the link target instead. The target is
relative to `.claude/skills`, not your shell's working directory. Verify that
`.claude/skills/exact-web-development/SKILL.md` resolves before starting the agent.
Do not replace an existing skill directory without reviewing its contents.

Where directory symlinks are unavailable, copy the complete canonical skill directory to
`.claude/skills/exact-web-development`. Treat that as a generated mirror: refresh it whenever the
canonical skill changes and make custom edits only in the canonical copy, so the two do not diverge.

The skill reads concise package-local `AGENTS.md` files for package-specific usage and package
READMEs for human-readable setup and examples.

[Documentation](https://techjoshua.github.io/exact/#/getting-started) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/agents/exact-skill)
