# openapi-backend — Threat Model

| | |
| --- | --- |
| **Project** | `openapi-backend` (npm), https://github.com/openapistack/openapi-backend |
| **Version / commit** | 5.20.3 / `0adc950` (`main`, 2026-09-15) |
| **Date** | 2026-09-16 |
| **Author** | Draft produced with the "Threat Model — Skill for Producing Open-Source Project Threat Models" procedure, draft-first mode |
| **Status** | **Draft — awaiting maintainer review.** Not yet ratified; do not cite as policy until §4.14 wave 1 is answered. |
| **Version binding** | This model is versioned with the package. A report against version *N* is triaged against the model as it stood at *N*, not at `main`. Revise per §4.12. |
| **Reporting cross-reference** | A finding that violates a §4.8 property is reported privately per [`SECURITY.md`](../SECURITY.md) (GitHub Security Advisory or `support@openapistack.co`). A finding that lands in §4.3 or §4.9 is closed citing the section. |
| **Provenance legend** | *(documented)* — stated in the project's own artifacts (README, hosted docs, code comments, tests, commit messages, advisories, maintainer comments on the issue tracker), cited inline. *(maintainer)* — stated by a maintainer in answer to a §4.14 question. *(inferred)* — reasoned from code structure or domain knowledge; not confirmed; has a matching §4.14 question. |
| **Draft confidence** | 37 documented / 0 maintainer / 31 inferred |

**What is being modeled.** `openapi-backend` is a Node.js library that takes an OpenAPI 3.0/3.1 document and, for each incoming HTTP request handed to it by a host framework (Express, Fastify, Koa, Hapi, AWS Lambda, Azure Functions, …), (1) routes the request to the operation the document declares, (2) runs operator-registered *security handlers* for the operation's security requirements and aggregates their results, (3) validates the request against the operation's JSON Schemas using Ajv, and (4) dispatches to an operator-registered *operation handler*. It can also validate responses and generate mock responses from the document's examples or schemas. It does not open a socket, parse HTTP, or send a response itself; the host framework does that.

---

## 4.2 Scope and intended use

**Intended use.** In-process request router / validator / auth-orchestrator behind a Node.js HTTP framework or serverless runtime, driven by a single OpenAPI document supplied by the operator *(documented — README "Quick Start", framework examples)*. Also used as a mock server for API development *(documented — README "Mocking API responses")*.

**Deployment contexts.** Long-running Node servers and FaaS (the `quick` option exists specifically for cold-start-sensitive serverless deployments) *(documented — hosted docs, constructor options)*. Node ≥ 20 *(documented — `package.json` `engines`)*.

**Roles.** This is a library embedded in a service, so the roles split as for a network service:

| Role | Trust | Supplies |
| --- | --- | --- |
| **Client** | untrusted | the `Request` object passed to `handleRequest` / `matchOperation` / `validateRequest` (method, path, headers, query, body) |
| **Operator / integrator** | trusted | the OpenAPI definition, constructor options, all handler and security-handler code, `handlerArgs`, `mockResponseForOperation` arguments, response objects passed to `validateResponse*` |
| **Host framework** | trusted | body/query pre-parsing, transport, response writing |

There is no "authenticated peer" role: the library holds no sessions and issues no credentials.

**Component-family table.**

| Family | Representative entry points | Touches outside the process? | In model? |
| --- | --- | --- | --- |
| **A. Definition loading & dereferencing** | `init`, `loadDocument`, `validateDefinition`, `refparser.ts`, `dereference-json-schema` (quick mode) | **Yes** — reads local files and fetches HTTP(S) URLs to resolve external `$ref`s via `@apidevtools/json-schema-ref-parser` (default `resolve.external: true`) *(inferred from dependency defaults)* | In — as a **trusted-input** boundary (§4.4) |
| **B. Router** | `matchOperation`, `parseRequest`, `normalizeRequest`, `normalizePath` (`router.ts`) | No | **In — primary attack surface** |
| **C. Request validator** | `validateRequest`, `buildRequestValidatorsForOperation`, Ajv instances (`validation.ts`) | No | **In — primary attack surface** |
| **D. Lifecycle orchestration & auth aggregation** | `handleRequest`, security-handler evaluation, `register*` (`backend.ts`) | No (calls operator code) | **In — primary attack surface** |
| **E. Response validation** | `validateResponse`, `validateResponseHeaders` | No | In, as a correctness feature only (§4.9) |
| **F. Mocking** | `mockResponseForOperation`, `mock-json-schema` | No | In, trusted-input only (§4.6) |
| **G. Examples** (`examples` branch, 14 projects) | — | Yes (real servers) | **Out** (§4.3) |
| **H. Test fixtures, SBOM, scripts** (`__tests__/resources`, `sbom/`, `scripts/`) | — | — | **Out** (§4.3) |

## 4.3 Out of scope (explicit non-goals)

- **Authentication and authorization decisions.** The library never inspects a credential. It calls operator-supplied security handlers and combines their boolean/error outcomes per the OpenAPI security-requirement semantics; whether a token is valid is the handler's problem *(documented — README "Auth / Security Handlers"; issue #31 design plan)*.
- **Transport, TLS, HTTP parsing, request-size limits, timeouts, rate limiting, compression.** All belong to the host framework or the platform *(inferred — no code touches them)*.
- **Error handling / response shaping for thrown errors.** "I've designed the library to be agnostic towards error handling. You can perform exception handling either within the operation handlers or simply catch from `handleRequest`" *(documented — maintainer, issue #88; reaffirmed #110)*.
- **Hostile OpenAPI definitions.** A definition is operator configuration. Attacks that require an attacker to author or modify the definition, the `apiRoot`, `ajvOpts`, `customizeAjv`, or any handler are out of model (§4.7). This includes SSRF / local-file read through external `$ref`s, ReDoS through schema `pattern`s, and pathological schemas that make Ajv compile slowly *(inferred)*.
- **Behaviour of the host framework's body/query parsers**, including prototype-pollution and depth/size behaviour of the objects they hand in as `req.body` / `req.query` *(inferred)*.
- **Response-body confidentiality.** Response validation is a development aid, not a data-leak control; the maintainer does not use runtime response validation in production *(documented — maintainer, issue #384)*.
- **Shipped-but-unsupported code.** The `examples` branch is "separate from the library source on `main`" *(documented — examples-branch README)*; example servers, their dependencies, and their auth configurations are threat-modelled by whoever copies them, not here. Test fixtures, the SBOM, and `scripts/` are not runtime code.
- **Supply-chain / build hygiene** (dependency advisories, CI pinning, SBOM accuracy) — out of scope for a threat model per §1 of the skill.

## 4.4 Trust boundaries and data flow

**The boundary is the `Request` object.** Everything the client controls enters through the five fields of `Request` (`method`, `path`, `headers`, `query`, `body`) passed to `handleRequest`, `matchOperation`, or `validateRequest`. Everything else the library reads — the definition, options, handlers, `handlerArgs` — is on the trusted side *(inferred)*.

**Data path and trust transitions** (per `handleRequest`, `backend.ts`):

1. `Request` (untrusted) → `router.parseRequest` → `context.request` (still untrusted; lower-cased headers, parsed cookies, parsed query, JSON-parsed string body).
2. `preRoutingHandler` (operator code, sees untrusted data).
3. `router.matchOperation` (untrusted `method`+`path` vs trusted path templates) → `context.operation` (trusted) or 404/405.
4. `parseRequest` again with the operation → path params (percent-decoded by `bath-es5` *after* matching), per-parameter query decoding.
5. Security handlers (operator code) run **concurrently for every scheme named in any requirement object**, receive untrusted `context`, return results → `context.security.authorized` (library-computed boolean).
6. `unauthorizedHandler` if registered and `authorized === false` → **early return**. Otherwise fall through (§4.5a, §4.9).
7. Validation → `context.validation`; `validationFail` if registered and errors → **early return**. Otherwise fall through *(documented — code comment `backend.ts`: "if no validation handler is specified, just ignore it and proceed to route handler")*.
8. `preOperationHandler`, operation handler or `notImplemented`, `postResponseHandler`. Handler return values are opaque to the library.

The library never turns untrusted data into trusted data. `context.security.authorized` and `context.validation.valid` are the only library-computed verdicts, and both are advisory unless the corresponding early-return handler is registered *(documented — tests `backend.test.ts` "sets security handler results to undefined if no handler is registered" reaches `notImplemented`; unmerged branch `docs/clarify-authorization-enforcement`; GHSA-7mmm-8m7g-cp5g closed without a patch)*.

**Reachability preconditions per family** (the test a triager applies first):

| Family | A finding is in-model only if… |
| --- | --- |
| A (loading) | it is reachable with an operator-authored definition and options. A finding requiring a malicious definition is `OUT-OF-MODEL: trusted-input`. Note that an un-initialised instance auto-initialises on the first `handleRequest` *(documented — code comment)*, so the *timing* of file/HTTP access can be client-triggered, but not its *target*. |
| B, C, D | it is reachable from the five `Request` fields with an arbitrary well-formed definition and default options, **or** with a non-default option the maintainer has not designated dev-only (§4.5a). |
| E | it is reachable from an operator-supplied response object. Client data reaches E only if the operator's handler copies it into the response. |
| F | it is reachable from `operationId`/`opts` values the operator sources from the client. Default usage (`c.operation.operationId`) is trusted. |

## 4.5 Assumptions about the environment

- **Runtime.** Node ≥ 20 *(documented — `package.json`)*. No native code. No browser support claimed.
- **Concurrency.** One `OpenAPIBackend` instance is shared across all concurrent requests. Per-request state lives only in the `context` object created per call. The mutable instance state touched at request time is the lazily-populated validator caches (`requestValidators` etc.) in `quick`/lazy mode; two concurrent first requests may compile the same validator twice, which is benign *(inferred)*. Handler and security-handler maps are copied at construction so callers' objects are not mutated *(documented — code comment and test "copies objects passed to constructor")*.
- **Time/clock.** Not used *(inferred)*.
- **Filesystem / network.** Used only in family A (§4.2), only for the definition path and external `$ref`s it names *(inferred)*.
- **What the library does *not* do to its host** (negative inventory, all *(inferred)* and a wave-1 confirmation target):
  - never opens listening sockets, never spawns processes, never installs signal handlers, never reads environment variables, never touches global state other than binding three `$RefParser` methods at module load;
  - at request time never touches the filesystem or network (except the auto-`init` case above);
  - writes to `console.warn` only at init (non-strict mode swallows init errors this way) and when a handler is registered for an unknown `operationId`/scheme in non-strict mode; never writes to stdout at request time;
  - does not mutate the `Request` object it is given (it spreads and clones), but **does** expose the operator's dereferenced definition objects by reference through `context.operation`; a handler that mutates `c.operation` mutates the shared definition.

### 4.5a Build-time and configuration variants

No compile-time flags. The runtime knobs that change which security properties hold:

| Knob | Default | Effect on the model | Maintainer stance |
| --- | --- | --- | --- |
| `unauthorizedHandler` registered | **not registered** | When absent, a request whose security requirements are *not* satisfied proceeds to validation and the operation handler with `context.security.authorized === false` *(documented — see §4.4)*. When present, such requests never reach the operation handler *(documented — tests)*. | **Ruling needed (wave 1, Q1).** Evidence points to (b) "operator must register it": GHSA-7mmm-8m7g-cp5g (Critical, "fail-open when `unauthorizedHandler` is not registered") was **closed with no patch**, and the same day a docs clarification was drafted stating security handlers "do not automatically stop request handling". If ratified, §4.10 carries the requirement and such reports are `BY-DESIGN: property-disclaimed`. |
| `validationFail` registered | **not registered** | When absent, requests failing schema validation proceed to the operation handler; `context.validation.valid === false` is the only signal *(documented — code comment)*. | Same shape as above; **wave 1, Q2**. |
| `validate` | `true` | `false` disables validation and skips compiling validators; a predicate can skip validation (and therefore coercion) per request *(documented — README, hosted docs)*. | Documented as a supported production choice ("skip validation for internal traffic"). |
| `strict` | `false` | Non-strict swallows definition load/validation errors (`console.warn`) and proceeds with an undefined/partial definition — every route then 404s — and only warns on unknown handler names *(documented — JSDoc and code)*. | Presumably dev convenience; **Q3**. |
| `quick` | `false` | Skips `validateDefinition` and uses a synchronous dereferencer; lazily compiles validators at first request *(documented — JSDoc: "attempts to optimise startup; might break things")*. Recommended for serverless *(documented — hosted docs)*. | Supported. The model treats a `quick` deployment as in-model. |
| `coerceTypes` | `false` | When `true`, the Ajv-coerced path/query values replace `context.request.params/query`. **When `false`, validation still runs Ajv with `coerceTypes: true` on the params schema, so `"1"` validates as `integer` but the handler receives the string** *(inferred from `validation.ts` `getAjv(ValidationContext.Params, { coerceTypes: true })`; behaviour confirmed by probe)*. | **Q4** — is the "validates as integer, delivered as string" gap intended? |
| `ajvOpts` / `customizeAjv` | `{ strict: false }` / none | Operator can weaken or strengthen everything Ajv does (`removeAdditional`, `useDefaults`, formats, `unicodeRegExp`, custom keywords). Operator-trusted. | Out of model when non-default and weakening (§4.7). |
| `ignoreTrailingSlashes` | `true` | `/pets/` and `/pets` route identically. | Documented default. |
| `apiRoot` | `/` | Operator string inserted unescaped into a `RegExp` for prefix stripping. Trusted. | — |

**Insecure-default note.** The two unregistered-handler defaults above are the only cases where the *default* voids a security property. Per the skill they must be ruled on by the maintainer before this model is published; the model's provisional reading is (b) for both, based on the advisory closure, but that is the maintainer's call.

## 4.6 Assumptions about inputs

**Per-parameter trust table — `handleRequest(req, ...handlerArgs)` (also `matchOperation`, `validateRequest`):**

| Field | Attacker-controllable? | What the library does | Caller must enforce |
| --- | --- | --- | --- |
| `req.method` | **yes** | trims, lower-cases; only `get put post delete options head patch trace` can match | nothing |
| `req.path` | **yes** | trims, prefixes `/`, drops from first `?`, strips `apiRoot`, strips trailing `/`; **no percent-decoding, no dot-segment or `//` normalisation before matching**; path params are percent-decoded *after* the segment has matched `[^/]+` (so `a%2Fb` is one segment that decodes to `a/b`) *(inferred; probe-confirmed)* | canonicalisation if the application cares about `..`, `//`, or encoded slashes; the framework normally supplies a decoded-or-raw path consistently |
| `req.headers` | **yes** | keys lower-cased; `cookie` parsed with `cookie.parse`; `content-type === 'application/json'` (exact match, no parameters) decides whether a non-object body is validated | header size limits (framework) |
| `req.query` (object) | **yes** | deep-cloned as-is; **nested objects and arrays are whatever the framework produced** | framework query-parser limits |
| `req.query` (string) or `?…` in path | **yes** | parsed by `qs` with defaults (`depth 5`, `parameterLimit 1000`, `arrayLimit 20`, prototype keys dropped) *(inferred; probe-confirmed)* | nothing beyond framework limits |
| `req.body` (object) | **yes** | used as-is (framework-parsed) | body size/depth limits (framework) |
| `req.body` (string/Buffer) | **yes** | `JSON.parse` attempted; failure is swallowed at parse time and surfaced as a `parse` validation error only when the operation's sole content type is `application/json` | body size limit (framework) |
| `req.params` | ignored | overwritten by library-parsed path params | — |
| `handlerArgs` | no — operator | passed through verbatim to every handler | — |

Per-parameter query handling that runs *before* validation on attacker data: `JSON.parse` on a parameter declared with `content: application/json` (uncaught — see §4.8 P6), and delimiter splitting for `explode: false` (guarded to strings since the fix for GHSA-4v89-4c72-fxv7).

**Trusted-only entry points** (all arguments are operator-sourced by contract):

| Function | Parameter | Attacker-controllable? | Note |
| --- | --- | --- | --- |
| `new OpenAPIBackend(opts)` | all of `opts` | no | definition may be a file path or URL resolved at `init` |
| `register*`, `registerSecurityHandler` | names, functions | no | |
| `mockResponseForOperation` | `operationId`, `opts.code/mediaType/example` | **no — trusted by contract**; if an operator forwards client values here, the lookups are plain object property reads on the definition (`responses[opts.code]`, `examples[opts.example]`) with no prototype-key guard *(inferred)* | see §4.11 |
| `validateRequest(req, operation)` | `operation` (string/object) | no | `req` is untrusted as above |
| `validateResponse*` | `res`, `headers`, `operation`, `statusCode` | no | |

**Size / shape / rate assumptions.** None are enforced by the library. Validation cost is bounded by Ajv's behaviour on the operator's schema against a body whose size the framework has already bounded *(inferred)*. Routing is O(number of operations) per request with a fresh `RegExp` per template *(inferred)*.

## 4.7 Adversary model

- **In scope: the unauthenticated network client.** Controls every byte of `method`, `path`, `headers`, `query`, `body` (subject to the framework's own parsing). Can send any number of requests. Goals the model cares about: reach an operation handler without satisfying its security requirements; reach a handler with data the schema should have rejected; cause a request to be routed to a different operation than the path/method denote; make `handleRequest` throw or hang; extract definition content it should not see *(inferred)*.
- **In scope, weaker: the client of a `notImplemented`-mocked API.** Same capabilities; goal is extracting example data (§4.9).
- **Out of scope.**
  - Anyone who can author or alter the OpenAPI definition, constructor options, or handler code — they are the operator *(inferred; corollary of §4.3)*.
  - In-process code (other modules, the framework) — "already won" *(inferred)*.
  - Side-channel and timing observers — the library performs no secret comparisons *(inferred)*.
  - Co-tenants, container escapes, OS-level attackers.
  - An attacker who can make `init` load a definition from an attacker-controlled path or URL — that is operator misconfiguration (§4.11).

## 4.8 Security properties the project provides

| # | Property (and conditions) | Violation symptom | Severity | Provenance |
| --- | --- | --- | --- | --- |
| **P1** | **Security-requirement semantics.** For a matched operation, `context.security.authorized` is `true` iff at least one Security Requirement Object in the operation's (or, failing that, the document's) `security` list has *every* named scheme's handler result truthy and not an object with a truthy `error`. A scheme with no registered handler counts as *failed*. A thrown/rejected handler counts as *failed*. Handler results are per-request. | `authorized === true` when a required scheme's handler returned falsy, returned `{ error: <truthy>, … }`, threw, or was unregistered; or `authorized === false` when the spec's OR/AND semantics say it should pass. | **Security-critical** (fail-open = CVE; GHSA-j939-289f-wq4w was fixed and published as High) | *(documented — hosted docs "Auth with Security Handlers"; commit `834158d` "fail-open authorization flaw"; tests)* |
| **P2** | **Enforcement gate when `unauthorizedHandler` is registered.** With it registered, a request with `authorized === false` and a non-empty requirement list never reaches validation, `preOperationHandler`, or the operation handler. | Operation handler invoked despite `authorized === false` and a registered `unauthorizedHandler`. | **Security-critical** | *(documented — tests "does not call operation handler if requirements are not met and unauthorizedHandler is defined")* |
| **P3** | **Routing fidelity.** A request is dispatched to the operation whose path template and method it matches under the documented normalisation (§4.6), preferring an exact path, then the most specific template; a path that matches no template yields 404 handling, a method that matches no operation on a matched path yields 405 handling. Path-parameter values are exactly the matched segment(s), percent-decoded. | A request reaching an operation whose template it does not match (route confusion), or path params containing bytes from outside the matched segment. | **Security-critical** when it changes which handler (and therefore which `security` requirements) applies; correctness-only otherwise. | *(inferred — tests cover matching/specificity but no doc states this as a security property)* |
| **P4** | **Validation gate when `validationFail` is registered and `validate` is on for the request.** A request is not dispatched to the operation handler if its path/query/header/cookie parameters or its `application/json` body (when `content-type` is exactly `application/json` or the framework supplied an object body) fail the operation's schema; unknown query and path parameters are rejected (`additionalProperties: false`); unknown headers and cookies are allowed; `required` path/query/header/cookie parameters are enforced. | `validationFail` not invoked for input the schema rejects, under the stated conditions. | **Security-critical** when the bypass is reachable from `Request` fields (validation is what integrators rely on to bound handler input); correctness-only for over-rejection. **Maintainer to confirm tier (Q5).** | *(documented — README "Request validation"; tests)* for the mechanism; *(inferred)* for the severity tier |
| **P5** | **No mutation of caller-supplied objects.** Constructor `handlers`/`securityHandlers` maps and the `Request` object are not mutated by the library. | Caller's object changed after a call. | Correctness-only | *(documented — code comments, test "copies objects passed to constructor")* |
| **P6** | **Error contract.** `handleRequest` reports failure by *rejecting the returned promise* with an `Error`; it never crashes the process itself, never swallows a thrown handler error, and never returns a fabricated success. Rejection is the *documented* outcome for: unmatched route with no `notFound` handler, no handler for the operation and no `notImplemented`, and any throw from operator handlers *(documented — code; maintainer #88 "simply catch from `handleRequest`")*. **Whether rejection on *malformed client input at the parse stage* is also inside this contract is unresolved:** GHSA-4v89-4c72-fxv7 (Moderate, `TypeError` on `?limit[a]=1` with `explode: false`) is in *Triage*, and its guard is on `main`, which suggests the maintainer treats parse-stage throws as bugs. The same shape remains for a query parameter declared with `content: application/json` and a malformed value (`JSON.parse` in `router.ts` `parseRequest`, uncaught; probe-confirmed rejection with `SyntaxError`). | Unhandled rejection, process exit, or a request that hangs. | **Availability, request-scoped**: the maintainer must state whether "a single request can make `handleRequest` reject before validation" is `VALID` (then P6 should read "resolves or rejects with a validation error for all well-typed `Request` inputs") or `BY-DESIGN` (caller catches). **Wave 1, Q6.** | *(documented — #88/#110 for the catch contract; inferred for the parse-stage boundary)* |
| **P7** | **No code evaluation of client data.** Client bytes are only ever `JSON.parse`d, string-split, regex-matched against operator templates, and schema-validated; never `eval`ed, never used to build a `RegExp`, never used as a file path or URL. | Any of those. | **Security-critical** | *(inferred)* |
| **P8** | **Resource use.** *No guarantee is made.* The library does not bound body size, nesting depth, query parameter count beyond `qs` defaults, or validation CPU. Super-linear behaviour in request size, if reported, is a bug only if the maintainer says so. | Hang or unbounded memory on a bounded request. | **Maintainer to rule (Q7).** Provisional line: "a hang or process crash on a size-bounded request is a bug; slow is not." | *(inferred)* |

## 4.9 Security properties the project does *not* provide

Plain statements first; false friends and attack classes after.

- **No authentication or authorization is performed by the library.** Security handlers are operator code. Declaring `securitySchemes` and `security` in the definition, on its own, blocks nothing *(documented — hosted docs; README)*.
- **No enforcement of `authorized === false` without `unauthorizedHandler`** (pending Q1). The operation handler runs and must check `c.security.authorized` itself *(documented — §4.4 sources)*.
- **No enforcement of validation errors without `validationFail`** (pending Q2) *(documented — code comment)*.
- **No content-type enforcement.** Only an `application/json` body (or an object body from the framework) is schema-validated; a body sent under any other media type, or under `application/json; charset=utf-8` as a raw string, passes to the handler unvalidated, and the library does not reject media types the operation does not declare *(inferred — code; issue #229 open with no maintainer ruling)*.
- **No request size, depth, count, or rate limits; no timeouts** (§4.8 P8).
- **No path canonicalisation** (§4.6). Two different raw paths that a framework or proxy would consider equivalent (`/a/../b`, `/a//b`, `/%61`) are different to this router.
- **No isolation between security handlers.** All handlers named anywhere in the requirement list run concurrently for every request, even for requirement objects that will not be needed; a handler with side effects (rate-limit counters, audit logs, token introspection calls) runs regardless of outcome *(inferred — `Promise.all` in `handleRequest`)*.
- **No constant-time comparison, hashing, signing, or randomness.** The library contains no cryptographic primitives; anything a handler compares is compared by handler code *(inferred)*.
- **No protection of the definition from its own consumers.** `context.operation` and `api.definition` are the live dereferenced objects; handlers can mutate them *(inferred)*.
- **No runtime response validation by default**, and when opted in it is a schema check, not a filter: it does not strip unexpected fields, and `validateResponse` without a `statusCode` accepts a body matching *any* declared response's schema, while a body for an undeclared status is not checked at all *(documented — README; issue #384 open, maintainer: "don't really see any need for runtime response validation")*.

**False friends** (things that look like a control but are not):

1. **`security:` in the definition ≈ auth enforcement.** It is a *list of handler names to consult*. Enforcement requires a registered handler for each scheme *and* `unauthorizedHandler` (or a check inside every operation handler). Reports of "bypass" that amount to this configuration are the single most common report shape against this project (GHSA-7mmm-8m7g-cp5g) *(documented)*.
2. **`validate: true` (the default) ≈ invalid requests are rejected.** It means *validation is computed*. Rejection needs `validationFail` *(documented — code comment)*.
3. **A passing schema ≈ correctly typed values in the handler.** With `coerceTypes: false` (default) an `integer` query parameter that validated still arrives as a string *(inferred; probe-confirmed)*. Handlers that branch on `typeof` or do arithmetic get JavaScript coercion, not schema coercion.
4. **`quick: true` ≈ same guarantees, faster.** It skips OpenAPI document validation; a definition that would have been rejected in normal mode is served as-is *(documented — JSDoc "might break things")*.
5. **`strict: false` (default) ≈ lenient about handler names only.** It also swallows *definition load failures*: a typo'd file path yields a warning and an instance that 404s everything, not an exception *(documented — code)*.
6. **`mockResponseForOperation` ≈ safe placeholder data.** It returns the definition's `example`/`examples` values *verbatim* (whatever the author put there, including realistic-looking credentials or PII) or `mock-json-schema` output. A `notImplemented` handler that mocks in production publishes those examples to any client *(inferred)*.
7. **`context.security[schemeName]` ≈ a verified identity.** It is whatever the handler returned, including `{ error }` objects and `undefined` for unregistered schemes; only `context.security.authorized` is library-computed *(documented — hosted docs)*.

**Well-known attack classes for this category (OpenAPI router/validator) that the library does not defend against and leaves to the caller:**

- *HTTP parameter pollution* — repeated query keys become arrays; a single string is auto-wrapped for `array` schemas; handlers must not assume scalar.
- *JSON-schema type confusion* (`"1"` vs `1`, `"true"` vs `true`) — see false friend 3.
- *Prototype pollution through body/query objects* — whatever the framework parser allows reaches the handler; the library's own `qs` use drops prototype keys but `req.query`/`req.body` objects are taken as given.
- *Decompression / oversized bodies, slow-loris, deeply nested JSON* — framework/platform layer.
- *ReDoS via schema `pattern`* — definition is trusted; an operator who copies a third-party definition inherits its regexes.
- *SSRF / local file read via `$ref`* — definition is trusted; an operator who loads a definition from an untrusted path or URL, or whose definition contains attacker-influenced external refs, has crossed the trust boundary themselves.
- *Example-data disclosure through mocks* — false friend 6.

## 4.10 Downstream responsibilities

The operator embedding `openapi-backend` must:

1. **Register `unauthorizedHandler`** whenever the definition declares any `security` requirement, *or* check `c.security.authorized` at the top of every protected operation handler (pending Q1; provisional).
2. **Register `validationFail`** (or check `c.validation.valid` in every handler) if the schema is relied on to bound handler input (pending Q2; provisional).
3. **Register a security handler for every scheme in `components.securitySchemes`.** An unregistered scheme fails closed, but silently; `strict: true` turns unknown *handler names* into errors, not missing handlers.
4. **Wrap `handleRequest` in `try/catch` (or `.catch`)** and map rejections to an error response *(documented — #88)*. Do not let a rejection propagate to Node's unhandled-rejection path.
5. **Bound request size, depth, and rate at the framework/platform layer.** The library assumes it.
6. **Canonicalise the path before handing it over** if the application's routes could be confused by `..`, `//`, or percent-encoded slashes, and pass the same form (raw vs decoded) consistently.
7. **Treat the definition as code.** Load it from a path or object the operator controls; audit `pattern`s and external `$ref`s in third-party definitions before use; never resolve a definition from a client-influenced location.
8. **Do not mock in production** (or scrub `example`/`examples` first) unless the examples are meant to be public.
9. **If `coerceTypes` is off, treat every path/query value as a string** in handlers, or turn it on.
10. **Do not forward client values into `mockResponseForOperation(opts)` or `validateRequest(req, operationIdString)`** without allow-listing them against the definition.
11. **Keep `validate` on and `quick` off in security-sensitive deployments unless the trade-off is understood** (quick mode skips document validation).
12. **Do not mutate `c.operation` or `api.definition`** from handlers; they are shared across requests.

## 4.11 Known misuse patterns

Draft-form one-liners; to be expanded before publication.

- Registering a security handler but no `unauthorizedHandler`, and no `authorized` check in operation handlers (GHSA-7mmm-8m7g-cp5g shape).
- Relying on schema validation with no `validationFail` handler.
- Returning `{ error: null, user }` from a security handler *is* the documented success pattern; returning `{ error: '...', user: null }` is failure — handlers that return arbitrary objects with an `error` key by accident (e.g. an upstream API response) fail closed unexpectedly *(documented — commit `acf6e8c`)*.
- Treating path/query values as typed without `coerceTypes`.
- Mocking with `notImplemented` in a production deployment.
- Setting `validate` to a predicate keyed on a client-controlled header (the README example uses `x-internal-request`) without the proxy stripping that header from external traffic — the predicate then lets any client skip validation.
- Loading the definition from a URL or from user-writable storage.
- Passing an operator-mutated `Request` whose `path` still contains the framework mount prefix while `apiRoot` is `/` (or vice versa), yielding universal 404s that get "fixed" by loosening the framework route to `/*` and thereby exposing every operation.
- Constructing one instance per request (defeats validator caching; not a security issue, but it is how `quick` mode ends up compiling under load).

### 4.11a Known non-findings (recurring false positives)

| Reported as | Why it is not a bug under this model |
| --- | --- |
| "`new RegExp` built from unescaped `path` template / `apiRoot`" (`router.ts`) | Templates and `apiRoot` are operator-authored (§4.6 trusted table). `OUT-OF-MODEL: trusted-input`. |
| "Ajv `strict: false` by default disables schema strictness" | Deliberate to accept OpenAPI-flavoured schemas (`nullable`, `example`, `discriminator`) *(inferred)*; the operator can override via `ajvOpts`. Not a vulnerability. |
| "Security scheme `X` has no handler and the request is not rejected" | Missing handler = failed scheme (P1). Whether the request is *rejected* depends on `unauthorizedHandler` (§4.5a). Disposition follows Q1; today `BY-DESIGN: property-disclaimed` (§4.9). |
| "Unauthenticated request reaches operation handler; `context.security.authorized === false`" | Same as above; GHSA-7mmm-8m7g-cp5g was closed on this basis. |
| "Invalid body reaches operation handler" | Requires `validationFail` (§4.9 false friend 2). `BY-DESIGN`. |
| "Body under `text/plain` / `application/xml` / `multipart` is not validated" | §4.9 "no content-type enforcement". `BY-DESIGN` pending #229. |
| "`JSON.parse` of request body without try/catch" (`validation.ts`) | It *is* wrapped; the error becomes a `parse` validation error. `KNOWN-NON-FINDING`. |
| "External `$ref` resolution reads arbitrary files / performs HTTP requests (SSRF)" | Definition is trusted; refs are operator-authored. `OUT-OF-MODEL: trusted-input`. |
| "ReDoS in schema `pattern`" | Trusted definition. `OUT-OF-MODEL: trusted-input`. |
| "Prototype pollution via `__proto__` in query string" | `qs` defaults drop prototype keys (probe-confirmed). For object `req.query`, the framework's parser is responsible (§4.3). |
| "`console.warn` leaks definition validation errors" | Init-time, operator-facing stderr, non-strict mode only. Not a client-reachable channel. |
| "`handleRequest` on an un-initialised instance triggers file reads" | Documented auto-`init`; target is operator-configured (§4.4 family A). |
| "Header/cookie `additionalProperties: true` lets unknown headers through" | Intentional: HTTP headers are open-ended; `additionalProperties: false` applies to path and query only (P4). |
| "Advisory in a devDependency / an `examples/*` dependency" | §4.3 out of scope. `OUT-OF-MODEL: unsupported-component`. |
| "`handleRequest` rejects with `TypeError`/`SyntaxError` on a crafted query string" | **Not yet a non-finding.** Routed by Q6; until answered it is `MODEL-GAP` and should be triaged conservatively (GHSA-4v89-4c72-fxv7 precedent). |

## 4.12 Conditions that would change this model

- A new `Request` field, or the library starting to parse a new encoding (XML, multipart bodies, `application/json` with parameters).
- Any change to the `unauthorizedHandler` / `validationFail` fall-through behaviour (e.g. a fail-closed default) — invalidates §4.5a, §4.9, §4.10 and the dispositions of past reports.
- The library gaining a network or filesystem surface at request time (e.g. remote definition reloads, OIDC discovery in a built-in security handler).
- Reference implementations of security handlers shipping in core (planned in issue #31 item 4) — they would become in-model authentication code and §4.3's first bullet would no longer hold.
- A change in Ajv defaults (`strict`, `coerceTypes` on the params validator) or in `qs` parsing options.
- Promotion of anything on the `examples` branch into the package.
- **Evidence of incompleteness:** any report that cannot be routed to exactly one §4.13 disposition. Q6 (parse-stage rejection) is already such a case and must be resolved by editing P6, not by ad-hoc triage.

## 4.13 Triage dispositions

| Disposition | Meaning | Licensed by |
| --- | --- | --- |
| `VALID` | Violates P1–P7 via the client adversary and an in-model input. | §4.8, §4.6, §4.7 |
| `VALID-HARDENING` | No property violated, but a §4.11 misuse is easy enough that the project elects to harden (e.g. warn at `init` when `security` is declared but no `unauthorizedHandler` is registered). Private report; maintainer discretion; typically no CVE. | §4.11 |
| `OUT-OF-MODEL: trusted-input` | Requires control of the definition, options, handlers, `handlerArgs`, or `mockResponseForOperation` arguments. | §4.6 |
| `OUT-OF-MODEL: adversary-not-in-scope` | Requires in-process, side-channel, co-tenant, or definition-author capability. | §4.7 |
| `OUT-OF-MODEL: unsupported-component` | Lands in the `examples` branch, test fixtures, `sbom/`, `scripts/`. | §4.3 |
| `OUT-OF-MODEL: non-default-build` | Only manifests under a weakening `ajvOpts`/`customizeAjv`, or under a default the maintainer has designated dev-only (pending Q1–Q3). | §4.5a |
| `BY-DESIGN: property-disclaimed` | Concerns a §4.9 non-property or false friend. | §4.9 |
| `KNOWN-NON-FINDING` | Matches a §4.11a row. | §4.11a |
| `MODEL-GAP` | Cannot be cleanly routed. Revise the model. | §4.12 |

**Back-map of prior reports** (validates the dispositions; not a CVE list):

| Report | Model disposition | Section |
| --- | --- | --- |
| GHSA-j939-289f-wq4w — multi-key `{ error, … }` treated as authorized (fixed 5.18.0) | `VALID` | P1 |
| GHSA-7mmm-8m7g-cp5g — fail-open without `unauthorizedHandler` (closed, no patch) | `BY-DESIGN: property-disclaimed` *provisionally*; becomes `VALID` if the maintainer answers Q1 with (a) | §4.5a, §4.9 |
| GHSA-4v89-4c72-fxv7 — `TypeError` on `?limit[a]=1` with `explode: false` (Triage; guard on `main`) | `MODEL-GAP` → resolved by Q6; the shipped guard suggests `VALID` (availability) | P6 |

## 4.14 Open questions for the maintainers

Every *(inferred)* tag above routes here. Each question states the proposed answer; confirm, correct, or strike.

**Wave 1 — scope, defaults, and the auth/validation gates** (these reshape §4.5a, §4.8, §4.9, §4.10, §4.13 together)

1. **`unauthorizedHandler` default.** *Proposed:* "Not registering `unauthorizedHandler` is a supported configuration; enforcement is then the operation handler's job via `c.security.authorized`. Reports of handler execution with `authorized === false` and no `unauthorizedHandler` are by design." (Evidence: GHSA-7mmm-8m7g-cp5g closed without patch; branch `docs/clarify-authorization-enforcement`.) Alternative: the default is a gap to be closed (fail-closed default or an `init`-time warning) — then the disposition is `VALID` / `VALID-HARDENING`. → §4.5a, §4.9, §4.10, back-map.
2. **`validationFail` default.** *Proposed:* same ruling as Q1, by symmetry. → §4.5a, §4.9, §4.10.
3. **`strict: false` default.** *Proposed:* "Non-strict is the supported production posture; swallowing init errors is intentional." → §4.5a.
4. **Coercion gap.** *Proposed:* "With `coerceTypes: false`, values validate as their schema type but are delivered as strings; this is intended and documented by the `coerceTypes` option." → §4.5a, §4.9 false friend 3.
5. **Severity of a validation-gate bypass (P4).** *Proposed:* "A request the schema rejects reaching the operation handler while `validationFail` is registered is security-relevant and handled via the advisory process." → P4.
6. **Parse-stage rejection (P6).** *Proposed:* "`handleRequest` should resolve (with `validation.valid === false`) rather than reject for any well-typed `Request`; a client-triggerable throw before validation is an availability bug, handled as GHSA-4v89-4c72-fxv7 was. The `JSON.parse` of `content: application/json` query parameters in `parseRequest` is therefore in the same class." Alternative: "Catching rejections is the caller's job (#88); parse-stage throws are not vulnerabilities." → P6, §4.11a last row, back-map.
7. **Resource line (P8).** *Proposed:* "No resource guarantee. A hang or process crash on a size-bounded request is a bug; slow is not." → P8.

**Wave 2 — trust boundary and host side effects**

8. **Definition is fully trusted.** *Proposed:* "The definition, including external `$ref`s it names and every `pattern`, is operator code; SSRF/file-read/ReDoS through it are out of model." → §4.3, §4.7, §4.11a.
9. **Negative side-effect inventory (§4.5).** *Proposed:* "No sockets, processes, signals, env reads, or global state; filesystem/network only at `init` for the definition; `console.warn` only at init/registration." → §4.5.
10. **Routing as a security property (P3).** *Proposed:* "Route confusion that changes which operation (and thus which `security` list) applies is security-critical." → P3.
11. **Path canonicalisation.** *Proposed:* "The router matches the raw path; percent-decoding happens only inside matched path parameters; `..`/`//` are not normalised. This is intended; frameworks canonicalise." → §4.6, §4.9.
12. **Content-type enforcement.** *Proposed:* "Only `application/json` (exact) bodies are validated; other media types pass through; issue #229 is an enhancement, not a vulnerability." → §4.9.

**Wave 3 — secondary surfaces and meta**

13. **Concurrent security handlers.** *Proposed:* "Running every named scheme's handler concurrently, regardless of requirement grouping, is intended; handlers must be side-effect-tolerant." → §4.9.
14. **Mock data disclosure.** *Proposed:* "Examples are published verbatim by `mockResponseForOperation`; mocking in production is a misuse, not a library issue." → §4.9 false friend 6, §4.11.
15. **`mockResponseForOperation` / `validateRequest(…, operationIdString)` arguments are trusted.** *Proposed:* yes. → §4.6.
16. **Shared definition objects via `context.operation`.** *Proposed:* "Handlers mutating `c.operation` is misuse; the library will not deep-freeze or clone per request." → §4.5, §4.10.
17. **Edge probe of a documented claim (P1):** "A scheme name listed in `security` but absent from `components.securitySchemes` — with `quick: true` the document validator does not catch this; is the resulting always-failed requirement the intended behaviour?" → P1, §4.5a.
18. **Meta — coexistence.** `SECURITY.md` is disclosure-process only and embeds no threat model, so there is nothing to merge. *Proposed:* `SECURITY.md` gains one line linking to this document as the scope reference; the unmerged `docs/clarify-authorization-enforcement` README paragraph is merged and cross-links §4.9. → header.
19. **Meta — ownership and revision.** *Proposed:* the maintainer owns this file; it is updated in the same PR as any change listed in §4.12; the draft-confidence line is updated as questions close.

---

### Appendix — provenance count

Documented: 37 · Maintainer: 0 · Inferred: 31. Every inferred claim maps to Q1–Q17 above. Q18–Q19 are meta questions with no body claim behind them.
