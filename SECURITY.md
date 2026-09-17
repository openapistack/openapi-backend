# Security Policy

## Reporting a vulnerability

Please report suspected security vulnerabilities privately. Do not open a public GitHub issue for an unpatched vulnerability.

The preferred channel is a private vulnerability report through GitHub Security Advisories: [Report a vulnerability](https://github.com/openapistack/openapi-backend/security/advisories/new). This keeps the report confidential and lets us collaborate on a fix and coordinate disclosure in one place.

If you cannot use GitHub, email **support@openapistack.co** with `SECURITY` in the subject line.

Please include, where possible:

- the affected package and version;
- a clear description of the vulnerability and its potential impact;
- reproduction steps or a minimal proof of concept;
- any relevant logs, configuration, or environment details; and
- whether the issue is publicly known or being actively exploited.

Please avoid including secrets or personal data in the report. If sensitive material is necessary, ask for a secure transfer method first.

## What to expect

We will acknowledge receipt as soon as practical, investigate in good faith, and keep the reporter informed when there is meaningful progress. We will coordinate disclosure with the reporter where possible, including credit if requested. There is no guaranteed response or remediation deadline.

## What counts as a vulnerability?

Short answer: it depends on which side of the `Request` object it lands.

The full contract lives in [docs/threat-model.md](docs/threat-model.md). This is the summary. Please read it before reporting, it will save us both a round trip.

**The trust boundary is the `Request` you pass to `handleRequest`.** Method, path, headers, query and body are attacker-controlled. Everything else is yours: the OpenAPI definition, constructor options, every handler and security handler, the arguments you forward to `mockResponseForOperation`. Anything that needs an attacker to edit your definition or your code is out of scope.

**What openapi-backend guarantees:**

- Security requirement semantics per the OpenAPI spec. A required scheme whose handler returned falsy, returned `{ error }`, threw or was never registered counts as failed. Fail-open here is a CVE (GHSA-j939-289f-wq4w was one).
- With `unauthorizedHandler` registered, or with `strict: true`, an unauthorised request never reaches your operation handler.
- With `validationFail` registered, or with `strict: true`, a request the schema rejects never reaches your operation handler.
- Routing goes to the operation the path template and method say, and nowhere else.
- Client bytes only ever get parsed and validated. Never evaluated, never used as a path, URL or regex. Malformed input becomes a validation error, never a rejected promise.
- A request that hangs the library or crashes the process is a bug. A slow one is not.

**What it does NOT do:**

- It does no authentication or authorisation itself. `security:` in the definition is a list of handlers to consult, not an enforcement rule.
- In the default non-strict mode, without `unauthorizedHandler` the operation handler still runs with `context.security.authorized === false`, and without `validationFail` it still runs with `context.validation.valid === false`. You get warned once. Both are on you until 6.0, where the library fails closed regardless.
- No request size, depth or rate limits. No timeouts. No path canonicalisation. No content-type enforcement beyond JSON. No crypto. Your framework and platform own those.
- Mocks return your definition's examples verbatim. Don't mock in production.

**So what should you do?** Set `strict: true` in production. Register a security handler for every scheme. Register `unauthorizedHandler` and `validationFail` if you want custom responses instead of thrown errors. Wrap `handleRequest` in a `try/catch`. That's the whole contract.

## Incident Response Plan

What happens if something actually goes wrong? Honest answer first: openapi-backend has one maintainer. There is no security team, no on-call rotation and no SLA. This is the plan for the person who is here, sized for the project it is. It's a compression of GitHub's [incident response guide](https://docs.github.com/en/code-security/tutorials/secure-your-organization/respond-to-a-security-incident) down to what one person can actually execute.

**What counts as an incident?** Something worse than a vulnerability report:

- A malicious or tampered version of `openapi-backend` on npm.
- The maintainer's GitHub or npm account, or the release workflow, compromised.
- A published vulnerability in the library being actively exploited.
- A dependency advisory that makes the library exploitable through a documented use.

A vulnerability report that isn't being exploited is not an incident. It goes through the process above.

**The plan:**

1. **Assess.** Is it real, is it still active, what's the blast radius? Check the GitHub audit log, the Actions runs for the release workflow, and diff the npm tarball against the git tag (`npm pack openapi-backend@x.y.z` vs `git archive x.y.z`). Releases are published by GitHub Actions from a git tag using OIDC, so there is no long-lived npm token sitting around to leak. If the tarball and the tag match, the release pipeline is probably fine and the problem is in the code.
2. **Contain.** In this order: `npm deprecate` the bad version with a message pointing to the advisory, revoke GitHub sessions and tokens, disable GitHub Actions on the repo, lock `main`. Deprecation beats unpublishing: unpublish breaks builds silently, deprecate warns every installer.
3. **Investigate.** Figure out the entry point before writing the fix. Check for persistence: unexpected workflows, webhooks, deploy keys, installed apps, collaborators.
4. **Remediate.** Rotate whatever could have been exposed. Publish a clean patch from a verified tag. Open or update a GitHub Security Advisory with affected and patched versions.
5. **Communicate.** The advisory is the single source of truth. Pin it in the README until the patched version is a week old. Reply to whoever reported it.
6. **Reflect.** Timeline and root cause go into the advisory. Anything that should change in the code or the process becomes an issue. Update [docs/threat-model.md](docs/threat-model.md) if the incident found a gap in it.

**Realistic expectations.** I'll aim to deprecate a confirmed malicious version within 24 hours of confirming it. Everything else is best effort, around a day job and a family. If I'm unreachable for an extended period there is nobody else with publish rights, and that's a known limitation of depending on a single-maintainer project. Pin your versions, review the diff when you bump them, and keep your own incident plan for the software you ship.

**Enterprise security inquiries.** Security questionnaires, SLAs, compliance attestations, escrow, or anything that needs a signature: reach out to **support@openapistack.co**. Those are commercial support topics, not something a public policy can promise.

## Scope and safe harbor

This policy covers security vulnerabilities in the code maintained in this repository and released versions of `openapi-backend`. Do not test against systems or data that you do not own or have explicit permission to assess, and do not intentionally access, modify, or retain data belonging to others.

We ask security researchers acting in good faith to avoid service disruption, privacy violations, and destructive testing. We will not pursue legal action for good-faith research that follows this policy, stays within scope, and stops when a vulnerability is confirmed.

This is a voluntary vulnerability-disclosure policy. It does not grant permission to test third-party systems and does not replace any legal or regulatory obligation that may apply.
