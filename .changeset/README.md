# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to
version and publish the `@querio/*` packages.

## Adding a changeset

Whenever you make a change that should be reflected in a release, run:

```bash
bun changeset
```

This opens a prompt asking for a version bump type (major / minor / patch) and
a summary of the change. A new markdown file is created in `.changeset/` that
describes the release.

## Versioning

The `fixed` group in `.changeset/config.json` keeps all four packages
(`@querio/core`, `@querio/prisma`, `@querio/drizzle`, `@querio/typeorm`) on the
same version so they ship together.

When changesets are present, the `version` workflow automatically opens or
updates a **Version Packages** pull request. Merging it bumps the versions and
updates the CHANGELOG files.

## Publishing

Publishing happens only when a `v*` tag is pushed and the CI checks pass — see
`.github/workflows/release.yml`.