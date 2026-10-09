# Security Policy

openapi-backend has a single maintainer: me, in my spare time. There is no security team, no bug bounty and no SLA. This policy is honest about what that means, and it tells you what I need from you to fix things quickly anyway.

## Supported versions

| Version | Security fixes |
| --- | --- |
| Latest 5.x release | ✅ Fixes ship as a new 5.x release. |
| Older 5.x releases | ❌ Upgrade to the latest 5.x. Fixes are not backported. |
| 4.x and older | ❌ Unsupported since 5.0.0 (2021). |

This table will say what happens to 5.x once 6.0 ships.

## Reporting a vulnerability

Please report suspected security vulnerabilities privately. Do not open a public issue, pull request or discussion for an unpatched vulnerability.

The preferred channel is a private vulnerability report through GitHub Security Advisories: [Report a vulnerability](https://github.com/openapistack/openapi-backend/security/advisories/new). This keeps the report confidential and lets us work on the fix and the advisory in one place.

If you cannot use GitHub, email **support@openapistack.co** with `SECURITY` in the subject line.

A report I can act on quickly has:

- the version you tested. Ideally the latest 5.x, since nothing else gets fixes;
- which guarantee in the [threat model](docs/threat-model.md#7-what-does-the-library-guarantee) it breaks (P1 to P8, R1 to R3), or why you think the model is missing something;
- a minimal runnable proof of concept: the definition, the `OpenAPIBackend` options and the request;
- the impact, in a few sentences; and
- whether the issue is public or being exploited.

One issue per report, please. Keep it short: skip CVSS scores and long background sections. A reproducer beats both.

Please avoid including secrets or personal data in the report. If sensitive material is necessary, ask for a secure transfer method first.

## What to expect

I read every report myself, as soon as practical, and I reply when I've looked at it. There is no guaranteed response or remediation deadline. Things move faster when the report is easy to reproduce.

Reports are triaged against the [threat model](docs/threat-model.md). If a report breaks one of its guarantees, I fix it in a private fork, release a new 5.x version and publish a [GitHub Security Advisory](https://github.com/openapistack/openapi-backend/security/advisories), crediting you unless you'd rather stay anonymous. I coordinate the disclosure with you where possible. If it lands outside the model, I close it and cite the section that covers it (§10a lists the usual suspects).

Published advisories are listed on the [Security tab](https://github.com/openapistack/openapi-backend/security/advisories). Please don't request a CVE for this project from another CNA; talk to me first.

## What counts as a vulnerability?

Short answer: it depends on which side of the `Request` object it lands.

The full contract lives in [docs/threat-model.md](docs/threat-model.md). This is the summary. Please read it before reporting, it will save us both a round trip.

**The trust boundary is the `Request` you pass to `handleRequest`.** Method, path, headers, query and body are attacker-controlled. Everything else is yours: the OpenAPI definition, constructor options, every handler and security handler, the arguments you forward to `mockResponseForOperation`. Anything that needs an attacker to edit your definition or your code is out of scope.

**What openapi-backend guarantees:**

- **Security requirement semantics per the OpenAPI spec (P1).** A required scheme whose handler returned falsy, returned `{ error }`, threw, rejected (with any reason) or was never registered counts as failed. Fail-open here is a High-severity advisory: GHSA-j939-289f-wq4w and GHSA-fwvf-w25j-mj87 were both.
- **Enforcement (P2, P4).** With `unauthorizedHandler` registered, or with `strict: true`, an unauthorised request never reaches your operation handler. With `validationFail` registered, or with `strict: true`, neither does a request the schema rejects.
- **Routing (P3).** A request goes to the operation its path template and method say, and nowhere else. The router adds no path aliases of its own. GHSA-m748-x4gc-4w5w fixed one that did.
- **Client bytes are data (P6, P7).** They only ever get parsed and validated. Never evaluated, never used as a path, URL or regex. Malformed input becomes a validation error, never a rejected promise.
- **No hangs, no crashes (P8).** A request that hangs the library or crashes the process is a bug. A slow one is not.
- **Releases come from this repository (R1 to R3).** See [Verifying a release](#verifying-a-release).

**What it does NOT do:**

- It does no authentication or authorisation itself. `security:` in the definition is a list of handlers to consult, not an enforcement rule.
- In the default non-strict mode, without `unauthorizedHandler` the operation handler still runs with `context.security.authorized === false`, and without `validationFail` it still runs with `context.validation.valid === false`. You get warned once. Both are on you until 6.0, where the library fails closed regardless.
- No request size, depth or rate limits. No timeouts. No path canonicalisation. No content-type enforcement beyond JSON. No crypto. Your framework and platform own those.
- Mocks return your definition's examples verbatim. Don't mock in production.

**Reported often, not a vulnerability here** (the full list with reasons is [§10a](docs/threat-model.md#10a-what-gets-reported-that-isnt-a-bug)):

- ReDoS in a schema `pattern`, or SSRF and file reads through `$ref`. The definition is trusted.
- An unauthorised or invalid request reaching your handler in non-strict mode without `unauthorizedHandler` / `validationFail`. That's the documented 5.x behaviour above.
- `handleRequest` rejecting: in strict mode, when nothing is registered to handle the outcome (no `notFound`, no operation handler), or because your own handler threw. Rejection is the documented error channel. Catch it.
- Issues in the `examples` branch, in devDependencies, or in dependencies that only ever see your definition ([§14](docs/threat-model.md#14-how-does-a-release-get-to-you) says which is which).
- Anything that only reproduces on an unsupported version.

## Running it safely

Set `strict: true` in production. Register a security handler for every scheme. Register `unauthorizedHandler` and `validationFail` if you want your own 401 and 400 responses. `strict: true` is the safety net when one is missing. Call `init()` before you serve traffic.

**Catch what `handleRequest` rejects.** In strict mode, a request that fails auth or validation with no handler registered rejects with a `401-unauthorized` or `400-validationFail` error. An uncaught rejection ends the process on Node 15 and later, and Express 4 does not catch errors from async middleware, so one unauthenticated request can take down the server. With Express 4, hand rejections to your error middleware:

```js
await api.init();
app.use((req, res, next) => api.handleRequest(req, req, res).catch(next));
```

That's the core of the contract. The full checklist is [§9 of the threat model](docs/threat-model.md#9-what-do-you-need-to-do). [openapi-backend-codeql](https://github.com/openapistack/openapi-backend-codeql) finds the most common mistakes in code scanning.

## Verifying a release

Since 5.16.0 (February 2026), every release is published from a git tag by [`ci.yml`](.github/workflows/ci.yml) through npm trusted publishing (OIDC). Each one carries a signed [provenance attestation](https://docs.npmjs.com/generating-provenance-statements) that names the workflow, the tag and the commit that built it. Older releases have none.

- `npm audit signatures` checks the registry signatures and provenance attestations of what you installed. It flags attestations that fail, not ones that are missing, so a 5.16.0-or-later release *without* one is your red flag.
- The version page on npmjs.com links each release to its commit and build.
- The build is reproducible. `npm ci --ignore-scripts && npm run build && npm pack` at a release tag gives a tarball byte-identical to the one on npm: its sha512 matches `npm view openapi-backend@<version> dist.integrity`.

To tie a tarball to this repository, its release workflow and its tag, use the GitHub CLI:

```sh
npm pack openapi-backend@5.21.2
curl -s https://registry.npmjs.org/-/npm/v1/attestations/openapi-backend@5.21.2 \
  | jq -c '.attestations[] | select(.predicateType == "https://slsa.dev/provenance/v1") | .bundle' > provenance.jsonl
gh attestation verify openapi-backend-5.21.2.tgz --bundle provenance.jsonl --digest-alg sha512 \
  --repo openapistack/openapi-backend \
  --signer-workflow openapistack/openapi-backend/.github/workflows/ci.yml \
  --source-ref refs/tags/5.21.2
```

Each GitHub release after 5.21.2 also carries the CycloneDX SBOM, license listings and third-party notices generated at its tag, and its changes are listed in [CHANGELOG.md](CHANGELOG.md).

Provenance tells you where a release was built, not that its code is good, and it names a workflow and a tag, not a person. Dependency versions come from your lockfile, not from this project. Commit one, and review the diff when you bump.

## Incident Response Plan

What happens if something actually goes wrong? Honest answer first: openapi-backend has one maintainer. There is no security team, no on-call rotation and no SLA. This is the plan for the person who is here, sized for the project it is. It's a compression of GitHub's [incident response guide](https://docs.github.com/en/code-security/tutorials/secure-your-organization/respond-to-a-security-incident) down to what one person can actually execute.

**What counts as an incident?** Something worse than a vulnerability report:

- A malicious or tampered version of `openapi-backend` on npm.
- The maintainer's GitHub or npm account, or the release workflow, compromised.
- A published vulnerability in the library being actively exploited.
- A dependency advisory that makes the library exploitable through a documented use. [§14](docs/threat-model.md#14-how-does-a-release-get-to-you) lists which dependencies ever see client data.

A vulnerability report that isn't being exploited is not an incident. It goes through the process above.

**The plan:**

1. **Assess.** Is it real, is it still active, what's the blast radius? Check the suspect version's provenance: it should name `ci.yml`, a tag I pushed, and a commit whose tree matches `main` (§14 of the threat model notes one harmless exception). A version without provenance, or one whose rebuild doesn't match (see [Verifying a release](#verifying-a-release)), didn't come out of the pipeline. Then check the GitHub audit log and the Actions runs. CI publishes with OIDC and never uses a stored npm token. If provenance and the rebuild both check out, the pipeline is probably fine and the problem is in the code.
2. **Contain.** In this order: `npm deprecate` the bad version with a message pointing to the advisory, ask npm support to take a malicious version down (a version other packages depend on can't simply be unpublished), revoke GitHub and npm sessions and tokens, disable GitHub Actions on the repo, lock `main`. Deprecation is the fast part I control. It warns every installer, where a silent unpublish would just break builds.
3. **Investigate.** Figure out the entry point before writing the fix. Check for persistence: unexpected workflows, webhooks, deploy keys, installed apps, collaborators, tags and npm trusted-publisher settings.
4. **Remediate.** Rotate whatever could have been exposed. Publish a clean patch from a verified tag. Open or update a GitHub Security Advisory with affected and patched versions.
5. **Communicate.** The advisory is the single source of truth. Pin it in the README until the patched version is a week old. Reply to whoever reported it.
6. **Reflect.** Timeline and root cause go into the advisory. Anything that should change in the code or the process becomes an issue. Update [docs/threat-model.md](docs/threat-model.md) if the incident found a gap in it.

**Realistic expectations.** I'll aim to deprecate a confirmed malicious version within 24 hours of confirming it. Everything else is best effort, around a day job and a family. If I'm unreachable for an extended period there is nobody else with publish rights, and that's a known limitation of depending on a single-maintainer project. Pin your versions, review the diff when you bump them, and keep your own incident plan for the software you ship.

**Enterprise security inquiries.** Security questionnaires, SLAs, compliance attestations, escrow, or anything that needs a signature: reach out to **support@openapistack.co**. Those are commercial support topics, not something a public policy can promise.

## Scope and safe harbor

This policy covers security vulnerabilities in the code maintained in this repository and released versions of `openapi-backend`. Do not test against systems or data that you do not own or have explicit permission to assess, and do not intentionally access, modify, or retain data belonging to others.

We ask security researchers acting in good faith to avoid service disruption, privacy violations, and destructive testing. We will not pursue legal action for good-faith research that follows this policy, stays within scope, and stops when a vulnerability is confirmed.

This is a voluntary vulnerability-disclosure policy. It does not grant permission to test third-party systems and does not replace any legal or regulatory obligation that may apply.
