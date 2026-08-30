# Contributing

Thanks for your interest in `dhs-plugins`.

## Adding a plugin

Each plugin lives in its own subdirectory and must declare a `dsh.bundle` manifest in its `package.json` (with a `cordis.patch.yml` beside it), so it is installable via `dsh plugin add`.

- Keep one plugin per subdirectory.
- Never commit credentials or `.env` files.
- Prefer scoped npm packages over bare names.

## Reporting issues

Open an issue at https://github.com/kevenliu3/dhs-plugins/issues.

## License

MIT — see [LICENSE](./LICENSE).
