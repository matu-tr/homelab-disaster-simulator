# Contributing

Thanks for considering a contribution to HomeLab Disaster Simulator.

## Ground rules

- The app is read-only by design — it never writes to Docker, TrueNAS, or the
  filesystem it inspects (aside from its own SQLite settings database).
  Contributions that add write/mutating behavior against the monitored host
  should be discussed in an issue first.
- Keep it single-host. Multi-node/fleet management is explicitly out of scope.

## Getting started

```bash
git clone https://github.com/matu-tr/homelab-disaster-simulator.git
cd homelab-disaster-simulator
npm install
npm run dev
```

The dev server needs access to a Docker socket (`/var/run/docker.sock`) to show
real data; without it, most panels will just show empty state.

## Making a change

1. Fork the repo and create a branch off `main`.
2. Make your change. Keep it scoped — small, focused PRs are much easier to
   review than large ones.
3. Run `npx tsc --noEmit` and `npm run lint` before opening a PR.
4. Open a pull request describing what changed and why.

## Reporting bugs

Open a [GitHub issue](https://github.com/matu-tr/homelab-disaster-simulator/issues)
with steps to reproduce, what you expected, and what happened instead. For
security issues, see [SECURITY.md](SECURITY.md) instead of a public issue.

## License

By contributing, you agree that your contributions will be licensed under the
project's [AGPL-3.0 license](LICENSE).
