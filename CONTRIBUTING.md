# Contributing

OpenAPI Backend is Free and Open Source Software. Issues and pull requests are more than welcome!

## Releases

Maintainers release with:

```sh
npm version patch # or minor, major
git push --follow-tags
```

The tag starts [`ci.yml`](.github/workflows/ci.yml), which tests and publishes to npm, then calls [`release.yml`](.github/workflows/release.yml). That workflow:

1. collects the commits and pull requests since the previous tag,
2. has GitHub Copilot CLI draft the notes, following [`.github/prompts/release-notes.md`](.github/prompts/release-notes.md),
3. checks the draft with [`scripts/release.mjs`](scripts/release.mjs), falling back to a plain commit list if it fails,
4. creates the GitHub release with the SBOM generated at the tag attached, and commits the entry to [`CHANGELOG.md`](CHANGELOG.md).

To change a published entry, edit `CHANGELOG.md` and the GitHub release. To create or refresh the release for an existing tag, run the Release workflow by hand with the tag. An entry already in `CHANGELOG.md` is used as is.

One-time setup: create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with only the account permission "Copilot Requests", and add it as the `COPILOT_GITHUB_TOKEN` repository secret. Drafts use the token owner's Copilot AI credits. When the token expires, releases fall back to the plain commit list until it is replaced. Set the `RELEASE_NOTES_MODEL` repository variable to change the model.
