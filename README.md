# Valent Mods for Claude Code

Claude Code mods by [Valent Partners](https://valentpartners.com).

| Mod | Code | Command | What it does |
| --- | --- | --- | --- |
| valent | [`valent/`](valent/) | `/valent` | The VP logo as a banner above the prompt, plus Valent teal and navy accents across the CLI |

## Install

Requires Claude Code 2.1.287 or later. In a Claude Code session:

```
/plugin marketplace add stracht-valent/valent-template
/plugin install valent@valent-mods
```

Or try it for one session from a clone:

```bash
claude --plugin-dir ./valent
```

## Develop

```bash
claude plugin validate ./valent
```
