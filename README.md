# Glyph (working codename)

A compiled programming language designed, specified, implemented and evolved by a team of AI agents, for language models as its primary users. It compiles to WebAssembly and aims at self-hosting.

- Build spec: [docs/SPEC.md](docs/SPEC.md). Interfaces between components: [CONTRACTS.md](CONTRACTS.md).
- Constitution and rules: [governance/](governance/). These are the only human design inputs.
- Everything runs in GitHub Actions (`.github/workflows/nightly.yml`) and GitHub Pages.

## Owner setup

```bash
gh secret set CLAUDE_CODE_OAUTH_TOKEN --env agents   # or ANTHROPIC_API_KEY
gh secret set CLAUDE_CODE_OAUTH_TOKEN --env bench
gh secret set HELDOUT_KEY --env bench < HELDOUT_KEY.txt
```

Run `tools/setup.sh` to generate `HELDOUT_KEY` and encrypt the held-out tasks.

Start a night by hand with `gh workflow run nightly.yml`. A dry run with scripted agents uses `-f agent_mode=scripted -f base_branch=dryrun`.

## Milestones

Flags under `gates:` in `governance/RULES.md` switch on later-milestone infrastructure: the benchmark gate (M3), differential dumps and the fixed point (M5), and the native backend (M7). The owner flips each one when the previous milestone's acceptance criteria hold.
