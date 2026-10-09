# Changelog

All notable changes to openapi-backend. This project follows [Semantic Versioning](https://semver.org).

New entries are drafted by an AI model from the merged pull requests and commits when a version tag is pushed, checked by a script, and published here and on [GitHub Releases](https://github.com/openapistack/openapi-backend/releases) by [`release.yml`](.github/workflows/release.yml). Releases before 5.16.0 are listed in the [tags](https://github.com/openapistack/openapi-backend/tags).

## [5.21.3](https://github.com/openapistack/openapi-backend/compare/5.21.2...5.21.3) - 2026-10-09

This release has no changes to the library's runtime behavior. It updates the security policy and threat model documentation, and refreshes development dependencies.

### Changed

- Revised security guidance: `SECURITY.md` now covers supported versions (the latest 5.x release), what makes a report actionable, how to verify a release, and a recommendation to catch `handleRequest` rejections. In strict mode these rejections signal 401 and 400 responses, and on Express 4 an uncaught rejection ends the process. The threat model was also updated ([#1014](https://github.com/openapistack/openapi-backend/pull/1014)).

### Dependencies

- Lockfile and development dependency updates ([#1018](https://github.com/openapistack/openapi-backend/pull/1018), [#1015](https://github.com/openapistack/openapi-backend/pull/1015), [#1010](https://github.com/openapistack/openapi-backend/pull/1010), [#1012](https://github.com/openapistack/openapi-backend/pull/1012)).

## [5.21.2](https://github.com/openapistack/openapi-backend/compare/5.21.1...5.21.2) - 2026-09-29

Two security fixes. Upgrade if you use security handlers or `apiRoot`.

### Security

- A security handler that threw or rejected with a falsy reason (`throw undefined`, `Promise.reject(null)`) was counted as passing, and a security scheme named `authorized` could overwrite the computed verdict. Both now fail authentication. High severity, a regression from the 5.18.0 fix. [GHSA-fwvf-w25j-mj87](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-fwvf-w25j-mj87) ([5ae65a2](https://github.com/openapistack/openapi-backend/commit/5ae65a2))
- `apiRoot` was stripped by prefix without a path boundary, so `//pets` routed to `/pets` and `/apiadmin` to `/api/admin`. The router no longer aliases paths. Medium severity. [GHSA-m748-x4gc-4w5w](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-m748-x4gc-4w5w) ([073c498](https://github.com/openapistack/openapi-backend/commit/073c498))

## [5.21.1](https://github.com/openapistack/openapi-backend/compare/5.21.0...5.21.1) - 2026-09-19

### Changed

- `SECURITY.md` has an incident response plan: what happens if a release, the maintainer's account or the release pipeline is compromised ([#998](https://github.com/openapistack/openapi-backend/pull/998)).

### Dependencies

- `@apidevtools/json-schema-ref-parser` updated from `^11.1.0` to `^16.0.2` ([#983](https://github.com/openapistack/openapi-backend/pull/983)).
- `cookie` updated to `^1.1.1` ([#990](https://github.com/openapistack/openapi-backend/pull/990)).
- Development dependencies updated; the test suite moved from Jest to Vitest ([#999](https://github.com/openapistack/openapi-backend/pull/999), [#1000](https://github.com/openapistack/openapi-backend/pull/1000)).

## [5.21.0](https://github.com/openapistack/openapi-backend/compare/5.20.3...5.21.0) - 2026-09-16

Security hardening from the new [threat model](docs/threat-model.md). If you run with `strict: true`, read the first entry.

### Security

- With `strict: true`, `handleRequest` now rejects with a `401-unauthorized` error when a request fails its security requirements and no `unauthorizedHandler` is registered, and with `400-validationFail` when validation fails and no `validationFail` handler is registered. Previously the operation handler ran. Non-strict mode keeps running the handler but warns once per instance. Requests will fail closed unconditionally in 6.0. Hardening for [GHSA-7mmm-8m7g-cp5g](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-7mmm-8m7g-cp5g) ([#996](https://github.com/openapistack/openapi-backend/pull/996)).

### Fixed

- A malformed JSON value in a query parameter declared with `content: application/json` no longer throws from `parseRequest`. Validation reports a `parse` error instead ([#996](https://github.com/openapistack/openapi-backend/pull/996)).
- Request bodies are matched to JSON by media type, so `application/json; charset=utf-8` is validated like `application/json` ([#996](https://github.com/openapistack/openapi-backend/pull/996)).

### Changed

- New [threat model](docs/threat-model.md), summarised in `SECURITY.md`: the trust boundary, what the library guarantees, and what you need to configure ([#996](https://github.com/openapistack/openapi-backend/pull/996), [#997](https://github.com/openapistack/openapi-backend/pull/997)).

## [5.20.3](https://github.com/openapistack/openapi-backend/compare/5.20.2...5.20.3) - 2026-09-15

### Dependencies

- `mock-json-schema` updated to `^1.1.3` ([25f6b43](https://github.com/openapistack/openapi-backend/commit/25f6b43)).

## [5.20.2](https://github.com/openapistack/openapi-backend/compare/5.20.1...5.20.2) - 2026-09-15

### Added

- A CycloneDX SBOM and third-party license notices, kept in `sbom/` and `THIRD_PARTY_NOTICES.md` ([#994](https://github.com/openapistack/openapi-backend/pull/994), [#995](https://github.com/openapistack/openapi-backend/pull/995)).

### Changed

- The example projects moved to the [`examples`](https://github.com/openapistack/openapi-backend/tree/examples) branch ([#991](https://github.com/openapistack/openapi-backend/pull/991)).

### Dependencies

- Lockfile updates for `ajv`, `qs`, `dereference-json-schema` and `mock-json-schema`, plus development dependencies and CI actions. Your own lockfile decides which versions you install.

## [5.20.1](https://github.com/openapistack/openapi-backend/compare/5.20.0...5.20.1) - 2026-08-23

### Deprecated

- `OpenAPIBackend#initalized` is renamed to `initialized`. The misspelled property still works as a deprecated alias ([#961](https://github.com/openapistack/openapi-backend/pull/961)).

### Changed

- Added a vulnerability disclosure policy in `SECURITY.md` ([#957](https://github.com/openapistack/openapi-backend/pull/957)).

## [5.20.0](https://github.com/openapistack/openapi-backend/compare/5.19.0...5.20.0) - 2026-07-29

### Fixed

- The `validate` option accepts a predicate function again. It was coerced to a boolean, so a predicate always enabled validation. The `BoolPredicate` type is renamed to `ContextPredicate`, with the old name kept as a deprecated alias ([#828](https://github.com/openapistack/openapi-backend/pull/828), thanks [@walker-sean](https://github.com/walker-sean); [#951](https://github.com/openapistack/openapi-backend/pull/951)).

## [5.19.0](https://github.com/openapistack/openapi-backend/compare/5.18.0...5.19.0) - 2026-07-25

### Fixed

- A request body is only required when the operation sets `requestBody.required: true`, as the OpenAPI spec says. Before, a body was required whenever the operation declared a single media type ([#921](https://github.com/openapistack/openapi-backend/pull/921), thanks [@kriptoburak](https://github.com/kriptoburak)).

## [5.18.0](https://github.com/openapistack/openapi-backend/compare/5.17.0...5.18.0) - 2026-06-24

### Security

- A security handler returning an object with an `error` key alongside other keys was treated as authorised. Any error object now fails authentication. High severity. [GHSA-j939-289f-wq4w](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-j939-289f-wq4w) ([#919](https://github.com/openapistack/openapi-backend/pull/919))

### Dependencies

- Lockfile update for `qs`, plus development dependencies and CI actions.

## [5.17.0](https://github.com/openapistack/openapi-backend/compare/5.16.1...5.17.0) - 2026-05-17

### Fixed

- `parseRequest` handles array query parameters when type coercion is on, and no longer throws a `TypeError` on inputs like `?limit[a]=1` for `explode: false` parameters. [GHSA-4v89-4c72-fxv7](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-4v89-4c72-fxv7) ([#870](https://github.com/openapistack/openapi-backend/pull/870), thanks [@clement-nardi](https://github.com/clement-nardi))

## [5.16.1](https://github.com/openapistack/openapi-backend/compare/5.16.0...5.16.1) - 2026-02-22

### Fixed

- Query parameters declared with `content: application/json` are only parsed when they are strings ([9ab72b4](https://github.com/openapistack/openapi-backend/commit/9ab72b4)).

### Dependencies

- `qs` updated to `^6.15.0` ([98d1703](https://github.com/openapistack/openapi-backend/commit/98d1703), [#816](https://github.com/openapistack/openapi-backend/issues/816)).

## [5.16.0](https://github.com/openapistack/openapi-backend/compare/5.15.0...5.16.0) - 2026-02-22

### Changed

- Requires Node.js 20 or later (`engines.node` was `>=12.0.0`).
- Releases are published from CI through npm trusted publishing, with a signed provenance attestation. See [Verifying a release](SECURITY.md#verifying-a-release) ([2520b7e](https://github.com/openapistack/openapi-backend/commit/2520b7e)).
