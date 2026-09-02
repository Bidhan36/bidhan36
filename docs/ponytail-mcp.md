# Ponytail MCP server

[Ponytail](https://github.com/DietrichGebert/ponytail) is a "lazy senior dev"
ruleset for AI coding agents. Its MCP server exposes that ruleset as a prompt
(`ponytail`) and a read-only tool (`ponytail_instructions`).

`.mcp.json` in the repo root wires it up for Claude Code.

## Setup

The server is **not** on npm — the `ponytail-mcp` package is marked private and
is excluded from the published `@dietrichgebert/ponytail` tarball, so there is
no `npx` shortcut. It has to run from a git clone.

1. Clone it somewhere permanent:

   ```bash
   git clone https://github.com/DietrichGebert/ponytail.git ~/src/ponytail
   ```

2. Install its dependencies (they are not vendored):

   ```bash
   cd ~/src/ponytail/ponytail-mcp && npm install
   ```

3. Point `PONYTAIL_HOME` at the clone, in your shell profile:

   ```bash
   export PONYTAIL_HOME="$HOME/src/ponytail"
   ```

4. Start Claude Code in this repo and approve the server when prompted.
   Project-scoped servers need a one-time approval per project.

Verify with `/mcp` — `ponytail` should list as connected.

## Modes

`PONYTAIL_DEFAULT_MODE` in `.mcp.json` sets the intensity: `lite`, `full`, or
`ultra`. The tool also takes a per-call `mode` argument that overrides it.

## Scope

`.mcp.json` is project-scoped, so this applies only in this repo. For every
project instead, register it at user scope and skip the committed file:

```bash
claude mcp add ponytail --scope user -- node "$PONYTAIL_HOME/ponytail-mcp/index.js"
```

## Caveat

MCP prompts and tools are pull-based — the agent asks for the rules, they are
not injected every turn. Ponytail's own docs note the MCP server is the option
for hosts whose only injection point is the prompt menu; the always-on
experience comes from its Claude Code hooks adapter instead.
