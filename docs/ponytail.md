# Ponytail

[Ponytail](https://github.com/DietrichGebert/ponytail) is a "lazy senior dev"
ruleset for AI coding agents: YAGNI, stdlib first, the smallest change that
works.

It installs into Claude Code as a plugin. Its hooks inject the ruleset at
session start and into every subagent, so it is active on every response —
unlike the MCP server, which only serves the rules when the agent asks.

Nothing needs to be committed to this repo. The install is per-machine and
applies to every project.

## Install

Two separate prompts in Claude Code — the install fails if they are sent
together:

```
/plugin marketplace add DietrichGebert/ponytail
```

```
/plugin install ponytail@ponytail
```

Then start a new session. You should see "Loading ponytail mode..." at
startup. In the desktop app's Code tab, the same two commands work, or use
**+** → **Plugins** → **Add plugin**.

## Modes

`lite`, `full` (default), `ultra`. Switch mid-session:

```
/ponytail ultra
```

Set the default for every new session with the `PONYTAIL_DEFAULT_MODE` env var
(`lite`/`full`/`ultra`/`off`), or a `defaultMode` field in
`~/.config/ponytail/config.json`.

Turn it off for the rest of a session by sending `stop ponytail` or
`normal mode` as the whole message.

## Other commands

`/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`,
`/ponytail-help`.

## Subagents

The ruleset is injected into every subagent spawned via the Agent tool. Scope
that with `PONYTAIL_SUBAGENT_MATCHER`, a case-insensitive regex tested against
the subagent's type — e.g. `^general$` to limit it to general-purpose agents.
