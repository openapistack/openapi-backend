# openapi-backend Threat Model

| | |
| --- | --- |
| **Project** | `openapi-backend` (npm), https://github.com/openapistack/openapi-backend |
| **Version / commit** | 5.21.0 (unreleased, branch `claude/focused-lamport-ndmg3r`), written against 5.20.3 / `0adc950` |
| **Date** | 2026-09-16 |
| **Status** | **Accepted by the maintainer, 2026-09-16.** Four minor questions still open in §13. None of them change a triage outcome. |
| **Version binding** | This model ships with the package. A report against version N gets triaged against the model as it was at N, not at `main`. |
| **Reporting** | Breaks a §7 property? Report it privately per [SECURITY.md](../SECURITY.md). Lands in §2 or §8? It gets closed citing this document. |
| **Provenance legend** | *(documented)* = stated in the project's own artifacts (README, docs site, code comments, tests, commit messages, advisories, maintainer comments on issues). *(maintainer, 2026-09)* = ruled by the maintainer while reviewing this document. *(inferred)* = my reading of the code, not confirmed, has a matching question in §13. |
| **Confidence** | 33 documented / 34 maintainer / 2 inferred |

## What is this document?

The unwritten contract between openapi-backend and whoever drops it into their API.

openapi-backend takes an OpenAPI 3.0/3.1 document and, for every request your framework (Express, Fastify, Koa, Hapi, Lambda, Azure Functions) hands it, does four things: routes the request to the operation the document declares, runs your security handlers and combines the results, validates the request against the JSON Schemas with Ajv, and calls your operation handler. It can also validate responses and mock responses from examples or schemas.

It does not open sockets, parse HTTP or write responses. Your framework does that.

Two readers: the integrator who wants to know which threats are theirs now, and the triager who needs to close a report by citing a section instead of arguing.

---

## 1. What is this library for?

**Intended use:** an in-process router / validator / auth orchestrator behind a Node.js HTTP framework or serverless runtime, driven by one OpenAPI document you control *(documented: README "Quick Start", framework examples)*. Also a mock server for API development *(documented: README "Mocking API responses")*.

**Deployment:** long-running Node servers and FaaS. The `quick` option exists for Lambda cold starts *(documented: docs site, constructor options)*. Node ≥ 20 *(documented: `package.json` engines)*.

**Who supplies what?**

| Role | Trust | Supplies |
| --- | --- | --- |
| **Client** | untrusted | the `Request` object passed to `handleRequest` / `matchOperation` / `validateRequest` (method, path, headers, query, body) |
| **Operator** (you) | trusted | the OpenAPI definition, constructor options, all handler and security handler code, `handlerArgs`, `mockResponseForOperation` arguments, the response objects passed to `validateResponse*` |
| **Framework** | trusted | body/query pre-parsing, transport, writing the response |

No "authenticated peer" role exists. The library holds no sessions and issues no credentials.

**Component families.** Same package, different threat profiles:

| Family | Entry points | Touches the outside world? | In model? |
| --- | --- | --- | --- |
| **A. Definition loading** | `init`, `loadDocument`, `validateDefinition`, `refparser.ts`, `dereference-json-schema` (quick mode) | **Yes.** Reads local files and fetches HTTP(S) URLs to resolve external `$ref`s via `@apidevtools/json-schema-ref-parser` (default `resolve.external: true`) *(maintainer, 2026-09)* | In, as a **trusted-input** boundary (§3) |
| **B. Router** | `matchOperation`, `parseRequest`, `parseRequestQuery`, `normalizeRequest`, `normalizePath` (`router.ts`) | No | **In. Primary attack surface.** |
| **C. Request validator** | `validateRequest`, `buildRequestValidatorsForOperation`, Ajv instances (`validation.ts`) | No | **In. Primary attack surface.** |
| **D. Lifecycle & auth aggregation** | `handleRequest`, security handler evaluation, `register*` (`backend.ts`) | No (calls your code) | **In. Primary attack surface.** |
| **E. Response validation** | `validateResponse`, `validateResponseHeaders` | No | In, as a correctness feature only (§8) |
| **F. Mocking** | `mockResponseForOperation`, `mock-json-schema` | No | In, trusted input only (§5) |
| **G. Examples** (`examples` branch, 14 projects) | | Yes (real servers) | **Out** (§2) |
| **H. Test fixtures, SBOM, scripts** | | | **Out** (§2) |

## 2. What is out of scope?

- **Authentication and authorisation decisions.** The library never looks at a credential. It calls your security handlers and combines their results per the OpenAPI security requirement semantics. Whether a token is valid is your handler's problem *(documented: README "Auth / Security Handlers"; issue #31 design plan)*.
- **Transport, TLS, HTTP parsing, request size limits, timeouts, rate limiting, compression.** Framework or platform *(maintainer, 2026-09)*.
- **Error handling for thrown errors.** "I've designed the library to be agnostic towards error handling. You can perform exception handling either within the operation handlers or simply catch from `handleRequest`" *(documented: maintainer, issue #88; again in #110)*.
- **Hostile OpenAPI definitions.** The definition is your config. Anything that needs an attacker to author or edit the definition, `apiRoot`, `ajvOpts`, `customizeAjv` or any handler is out of model (§6). That includes SSRF / local file read through external `$ref`s, ReDoS through schema `pattern`s and schemas that make Ajv compile slowly *(maintainer, 2026-09)*.
- **Your framework's body/query parser.** Prototype pollution, depth and size behaviour of the objects it hands over as `req.body` / `req.query` *(maintainer, 2026-09)*.
- **Response body confidentiality.** Response validation is a dev aid, not a data leak control. I don't use runtime response validation in production myself *(documented: maintainer, issue #384)*.
- **Shipped but unsupported code.** The `examples` branch is "separate from the library source on `main`" *(documented: examples branch README)*. Example servers, their dependencies and their auth setups are modelled by whoever copies them. Test fixtures, the SBOM and `scripts/` are not runtime code.
- **Supply chain and build hygiene.** Dependency advisories, CI pinning, SBOM accuracy. Important, not a threat model topic.

## 3. Where is the trust boundary?

**The `Request` object. That's it.** Everything the client controls comes in through the five fields of `Request` (`method`, `path`, `headers`, `query`, `body`) passed to `handleRequest`, `matchOperation` or `validateRequest`. Everything else the library reads (definition, options, handlers, `handlerArgs`) is on the trusted side *(maintainer, 2026-09)*.

**How a request flows** (`handleRequest` in `backend.ts`):

1. `Request` (untrusted) → `router.parseRequest` → `context.request`. Still untrusted, just tidier: lower-cased headers, parsed cookies, parsed query, JSON-parsed string body.
2. `preRoutingHandler` (your code, sees untrusted data).
3. `router.matchOperation`: untrusted `method` + `path` vs trusted path templates → `context.operation` (trusted) or 404/405.
4. `parseRequest` again with the operation. Path params get percent-decoded by `bath-es5` *after* matching. Query params get per-parameter decoding.
5. Security handlers (your code) run **concurrently for every scheme named in any requirement object**. They get the untrusted `context`, return results → `context.security.authorized` (computed by the library).
6. `authorized === false` with requirements present: `unauthorizedHandler` if registered → **early return**. No handler and `strict: true` → **reject with `401-unauthorized`**. No handler and `strict: false` → warn once, fall through (§4a, §8).
7. Validation → `context.validation`. Errors: `validationFail` (or `400`) if registered → **early return**. No handler and `strict: true` → **reject with `400-validationFail`**. No handler and `strict: false` → warn once, fall through *(documented: code comments in `backend.ts`; tests "without unauthorizedHandler" and "without validationFail handler")*.
8. `preOperationHandler`, the operation handler or `notImplemented`, `postResponseHandler`. Return values are opaque to the library.

The library never turns untrusted data into trusted data. `context.security.authorized` and `context.validation.valid` are the only verdicts the library computes. **In non-strict mode both are advisory unless the matching handler is registered. In strict mode they are enforced.** *(maintainer, 2026-09)*

**Reachability test per family.** First thing a triager checks:

| Family | A finding matters only if… |
| --- | --- |
| A (loading) | it's reachable with an operator-authored definition and options. Needs a malicious definition? `OUT-OF-MODEL: trusted-input`. Note: an un-initialised instance auto-inits on the first `handleRequest` *(documented: code comment)*, so a client can control *when* files/URLs get read, but never *which*. |
| B, C, D | it's reachable from the five `Request` fields with any well-formed definition and default options, **or** with a non-default option that isn't dev-only per §4a. |
| E | it's reachable from an operator-supplied response object. Client data only gets here if your handler copies it into the response. |
| F | it's reachable from `operationId` / `opts` values you sourced from the client. Default usage (`c.operation.operationId`) is trusted. |

## 4. What does the library assume about its host?

- **Runtime:** Node ≥ 20 *(documented: `package.json`)*. No native code. No browser support claimed.
- **Concurrency:** one `OpenAPIBackend` instance is shared across all concurrent requests. Per-request state lives in the `context` object only. Mutable instance state touched at request time: the lazy validator cache (`requestValidators` etc.) in `quick` / lazy mode, and the once-only warning set. Two concurrent first requests may compile the same validator twice. Harmless *(maintainer, 2026-09)*. Handler maps are copied at construction so your objects don't get mutated *(documented: code comment and test "copies objects passed to constructor")*.
- **Clock:** not used *(maintainer, 2026-09)*.
- **Filesystem / network:** family A only (§1), only for the definition path and the external `$ref`s it names *(maintainer, 2026-09)*.
- **What it does NOT do to your process** *(maintainer, 2026-09)*:
  - never opens listening sockets, spawns processes, installs signal handlers, reads env vars or touches global state (except binding three `$RefParser` methods at module load);
  - never touches filesystem or network at request time (except the auto-init case above);
  - writes to `console.warn` at init (non-strict mode swallows init errors this way), when you register a handler for an unknown operationId/scheme in non-strict mode, and once per instance when a non-strict request falls through a missing `unauthorizedHandler` or `validationFail`. Never writes to stdout;
  - doesn't mutate the `Request` you pass in (it spreads and clones). But it **does** hand out the live dereferenced definition objects via `context.operation`. A handler that mutates `c.operation` mutates the shared definition. That's misuse, not a library bug. The library won't deep-freeze or clone per request.

### 4a. Which options change the security envelope?

No compile-time flags. Runtime knobs that matter:

| Knob | Default | What changes | Ruling |
| --- | --- | --- | --- |
| `strict` | `false` | **Strict is "fail closed".** `true`: init throws on definition errors, `register` throws on unknown names, and `handleRequest` rejects with `401-unauthorized` / `400-validationFail` when a request fails security requirements / validation and no `unauthorizedHandler` / `validationFail` handler is registered. `false`: all of those warn instead and the request continues *(documented: JSDoc, code, tests)*. | **Default stays `false`.** Lenient by default is the library's character, strict is the production posture *(maintainer, 2026-09)*. **Planned for 6.0:** the fall-through goes away regardless of `strict`. Unregistered `unauthorizedHandler` / `validationFail` will reject unconditionally *(maintainer, 2026-09)*. |
| `unauthorizedHandler` registered | **no** | Not registered: see `strict`. Registered: a request that fails its requirements never reaches the operation handler *(documented: tests)*. | Non-strict fall-through is **by design in 5.x, hardened with a once-only warning**. Register it, or check `c.security.authorized` in every protected handler, or set `strict: true` *(maintainer, 2026-09)*. |
| `validationFail` (or `400`) registered | **no** | Not registered: see `strict`. Registered: a request the schema rejects never reaches the operation handler *(documented: tests)*. | Same ruling as `unauthorizedHandler` *(maintainer, 2026-09)*. |
| `validate` | `true` | `false` disables validation and skips compiling validators. A predicate can skip validation (and so coercion) per request *(documented: README, docs site)*. | Supported production choice ("skip validation for internal traffic"). |
| `quick` | `false` | Skips `validateDefinition`, uses a sync dereferencer, compiles validators lazily at first request *(documented: JSDoc, "attempts to optimise startup; might break things")*. Recommended for serverless *(documented: docs site)*. | Supported. A `quick` deployment is in model. |
| `coerceTypes` | `false` | `true`: Ajv-coerced path/query values replace `context.request.params/query`. `false`: validation still runs Ajv with `coerceTypes: true` on the params schema, so `"1"` validates as `integer` but your handler gets the string. | **Intended.** Lenient matching, raw delivery. Documented as §8 false friend 3 *(maintainer, 2026-09)*. |
| `ajvOpts` / `customizeAjv` | `{ strict: false }` / none | You can weaken or strengthen everything Ajv does (`removeAdditional`, `useDefaults`, formats, `unicodeRegExp`, custom keywords). Trusted. | Out of model when non-default and weakening (§6). |
| `ignoreTrailingSlashes` | `true` | `/pets/` and `/pets` route the same. | Documented default. |
| `apiRoot` | `/` | Operator string, inserted unescaped into a `RegExp` for prefix stripping. Trusted. | |

**So what's the insecure default story?** In 5.x: not registering `unauthorizedHandler` or `validationFail` is a supported non-strict configuration, you get warned once, and `strict: true` is one line away. In 6.0 the choice goes away and the library fails closed. That's the migration path, and it's the ruling on GHSA-7mmm-8m7g-cp5g (§12).

## 5. What inputs does the library accept, and from whom?

**`handleRequest(req, ...handlerArgs)`** (same for `matchOperation`, `validateRequest`):

| Field | Attacker controls it? | What the library does with it | You must enforce |
| --- | --- | --- | --- |
| `req.method` | **yes** | trims, lower-cases; only `get put post delete options head patch trace` can match | nothing |
| `req.path` | **yes** | trims, prefixes `/`, drops everything from the first `?`, strips `apiRoot`, strips trailing `/`. **No percent-decoding, no `..` or `//` normalisation before matching.** Path params get percent-decoded *after* the segment matched `[^/]+` (so `a%2Fb` is one segment that decodes to `a/b`) *(maintainer, 2026-09; confirmed by probe)* | canonicalisation if your app cares about `..`, `//` or encoded slashes. Frameworks normally give a decoded or raw path consistently |
| `req.headers` | **yes** | keys lower-cased; `cookie` parsed with `cookie.parse`; the media type of `content-type` (parameters such as `charset` ignored) decides whether a non-object body gets validated as JSON | header size limits (framework) |
| `req.query` (object) | **yes** | deep-cloned as is. **Nested objects and arrays are whatever your framework produced** | framework query parser limits |
| `req.query` (string) or `?…` in path | **yes** | parsed by `qs` with defaults (`depth 5`, `parameterLimit 1000`, `arrayLimit 20`, prototype keys dropped) *(maintainer, 2026-09; confirmed by probe)* | nothing beyond framework limits |
| `req.body` (object) | **yes** | used as is (framework-parsed) | body size/depth limits (framework) |
| `req.body` (string/Buffer) | **yes** | `JSON.parse` attempted. Failure is swallowed at parse time and surfaces as a `parse` validation error when the operation's sole content type is `application/json`, or as a schema error when the media type is JSON | body size limit (framework) |
| `req.params` | ignored | overwritten by the library's own path param parsing | |
| `handlerArgs` | no, operator | passed through verbatim to every handler | |

Per-parameter query handling that runs on attacker data *before* validation: `JSON.parse` on a parameter declared with `content: application/json` (failure leaves the raw string and validation reports a `parse` error) and delimiter splitting for `explode: false` (guarded to strings). Neither throws *(documented: tests in `router.test.ts` and `validation.test.ts`)*.

**Trusted-only entry points.** Every argument is operator-sourced by contract:

| Function | Parameter | Attacker controls it? | Note |
| --- | --- | --- | --- |
| `new OpenAPIBackend(opts)` | all of `opts` | no | definition can be a file path or URL, resolved at `init` |
| `register*`, `registerSecurityHandler` | names, functions | no | |
| `mockResponseForOperation` | `operationId`, `opts.code/mediaType/example` | **no, trusted by contract.** If you forward client values here, the lookups are plain property reads on the definition (`responses[opts.code]`, `examples[opts.example]`) with no prototype key guard *(inferred, Q1)* | see §10 |
| `validateRequest(req, operation)` | `operation` (string/object) | no | `req` is untrusted as above |
| `validateResponse*` | `res`, `headers`, `operation`, `statusCode` | no | |

**Size, shape, rate:** nothing enforced. Validation cost is whatever Ajv does with your schema against a body your framework already bounded. Routing is O(number of operations) per request with a fresh `RegExp` per template *(maintainer, 2026-09)*.

## 6. Who is the attacker?

**In scope: the unauthenticated network client.** Controls every byte of `method`, `path`, `headers`, `query`, `body` (modulo your framework's parsing). Can send as many requests as they like. What they want: reach an operation handler without satisfying its security requirements, reach a handler with data the schema should have rejected, get routed to a different operation than the path/method says, make `handleRequest` throw or hang, pull definition content they shouldn't see *(maintainer, 2026-09)*.

**In scope, weaker: the client of a `notImplemented`-mocked API.** Same capabilities. Goal: extract example data (§8).

**Out of scope** *(maintainer, 2026-09)*:

- Anyone who can author or alter the definition, options or handler code. That's the operator.
- In-process code (other modules, the framework). Already won.
- Side channel and timing observers. The library compares no secrets.
- Co-tenants, container escapes, OS-level attackers.
- Anyone who can make `init` load a definition from a path or URL they control. That's operator misconfiguration (§10).

## 7. What does the library guarantee?

Only properties the project has actually committed to. No inventing.

| # | Property (and when it holds) | What a break looks like | Severity | Provenance |
| --- | --- | --- | --- | --- |
| **P1** | **Security requirement semantics.** For a matched operation, `context.security.authorized` is `true` iff at least one Security Requirement Object in the operation's (or, failing that, the document's) `security` list has *every* named scheme's handler result truthy and not an object with a truthy `error`. Scheme with no registered handler → *failed*. Handler threw or rejected → *failed*. Results are per request. | `authorized === true` when a required scheme's handler returned falsy, returned `{ error: <truthy>, … }`, threw or was unregistered. Or `authorized === false` when the spec's OR/AND says it should pass. | **Security-critical.** Fail-open = CVE. GHSA-j939-289f-wq4w was fixed and published as High. | *(documented: docs site "Auth with Security Handlers"; commit `834158d` "fail-open authorization flaw"; tests)* |
| **P2** | **Enforcement gate.** With `unauthorizedHandler` registered, or with `strict: true`, a request with `authorized === false` and a non-empty requirement list never reaches validation, `preOperationHandler` or the operation handler. | Operation handler runs despite `authorized === false` under either condition. | **Security-critical** | *(documented: tests "does not call operation handler if requirements are not met and unauthorizedHandler is defined", "rejects with 401 in strict mode if requirements are not met")* |
| **P3** | **Routing fidelity.** A request goes to the operation whose path template and method it matches under the normalisation in §5: exact path first, then the most specific template. No template matches → 404 handling. Path matches, method doesn't → 405 handling. Path param values are exactly the matched segment, percent-decoded. | A request reaching an operation its template doesn't match (route confusion), or path params with bytes from outside the matched segment. | **Security-critical** when it changes which handler (and so which `security` list) applies. Correctness-only otherwise. | *(maintainer, 2026-09; tests cover matching and specificity)* |
| **P4** | **Validation gate.** With `validationFail` (or `400`) registered, or with `strict: true`, and `validate` on for the request: a request doesn't reach the operation handler if its path/query/header/cookie parameters or its JSON body (media type `application/json`, parameters ignored, or an object body from the framework) fail the operation's schema, or if a `content: application/json` query param isn't valid JSON. Unknown query and path params are rejected (`additionalProperties: false`). Unknown headers and cookies are allowed. `required` params are enforced for all four locations. | Operation handler called for input the schema rejects, under the stated conditions. | **Security-critical** when the bypass is reachable from `Request` fields. Goes through the advisory process, not the issue tracker. Correctness-only for over-rejection. | *(documented: README "Request validation"; tests)* for the mechanism; *(maintainer, 2026-09)* for the tier |
| **P5** | **No mutation of your objects.** Constructor `handlers` / `securityHandlers` maps and the `Request` object are not mutated. | Your object changed after a call. | Correctness-only | *(documented: code comments, test "copies objects passed to constructor")* |
| **P6** | **Error contract.** For any well-typed `Request`, `handleRequest` either resolves or rejects with an `Error` that the library or your handlers threw on purpose. Rejection is the *documented* outcome for: unmatched route with no `notFound` handler, no handler for the operation and no `notImplemented`, `strict: true` with a failed security requirement or validation and no handler (§4a), and any throw from your handlers *(documented: code; maintainer #88, "simply catch from `handleRequest`")*. **Malformed client input never rejects before validation.** It becomes a validation error. GHSA-4v89-4c72-fxv7 (`TypeError` on `?limit[a]=1` with `explode: false`) was this class, fixed in 5.17.0. The sibling case, malformed JSON in a `content: application/json` query param, is fixed in 5.21.0. | Unhandled rejection or process exit on a crafted request, or a rejection whose stack points at the parser rather than a handler. | **Availability, request-scoped. `VALID`.** | *(maintainer, 2026-09; documented: tests "leaves malformed json … instead of throwing", "fails validation with a parse error")* |
| **P7** | **No code evaluation of client data.** Client bytes only ever get `JSON.parse`d, string-split, regex-matched against operator templates and schema-validated. Never `eval`ed, never used to build a `RegExp`, never used as a file path or URL. | Any of those. | **Security-critical** | *(maintainer, 2026-09)* |
| **P8** | **Resource use.** A hang or a process crash on a size-bounded request is a bug. Super-linear CPU or memory in request size is a bug. Constant-factor slowness is not. Body size limits stay with the framework. | Hang, crash or super-linear growth on a bounded request. | **Availability. `VALID` on the stated line.** | *(maintainer, 2026-09)* |

## 8. What does the library NOT do?

The most useful section for an integrator. Read this one twice.

- **No authentication or authorisation.** Security handlers are your code. Declaring `securitySchemes` and `security` in the definition blocks nothing on its own *(documented: docs site; README)*.
- **No enforcement of `authorized === false` in non-strict mode without `unauthorizedHandler`.** The operation handler runs (after a once-only warning) and has to check `c.security.authorized` itself. Strict mode rejects. 6.0 will reject regardless *(maintainer, 2026-09)*.
- **No enforcement of validation errors in non-strict mode without `validationFail`.** Same shape *(maintainer, 2026-09)*.
- **No content-type enforcement.** Only a JSON body (media type `application/json`, parameters like `charset` ignored, or an object body from the framework) is schema-validated. A body sent as text, XML or multipart goes to your handler unvalidated. Media types the operation doesn't declare are not rejected either *(maintainer, 2026-09; issue #229 stays an enhancement)*.
- **No request size, depth, count or rate limits. No timeouts.** (§7 P8)
- **No path canonicalisation** (§5). `/a/../b`, `/a//b` and `/%61` are three different paths to this router, whatever your proxy thinks *(maintainer, 2026-09)*.
- **No isolation between security handlers.** All handlers named anywhere in the requirement list run concurrently for every request, even for requirement objects that won't be needed. A handler with side effects (rate limit counters, audit logs, token introspection calls) runs regardless of the outcome. Intended. Handlers must tolerate it *(maintainer, 2026-09)*.
- **No constant-time comparison, hashing, signing or randomness.** Zero crypto in the library. Whatever a handler compares, handler code compares *(maintainer, 2026-09)*.
- **No protection of the definition from its own consumers.** `context.operation` and `api.definition` are the live dereferenced objects *(maintainer, 2026-09)*.
- **No runtime response validation by default.** When you opt in it's a schema check, not a filter: it doesn't strip unexpected fields, `validateResponse` without a `statusCode` accepts a body matching *any* declared response's schema, and a body for an undeclared status isn't checked at all *(documented: README; issue #384 open, maintainer: "don't really see any need for runtime response validation")*.

**False friends.** Things that look like a control but aren't:

1. **`security:` in the definition ≈ auth enforcement.** It's a *list of handler names to consult*. Enforcement needs a registered handler for each scheme *and* one of: `unauthorizedHandler`, `strict: true`, or a check inside every operation handler. "Bypass" reports that boil down to this config are the single most common report shape against this project (GHSA-7mmm-8m7g-cp5g) *(documented)*.
2. **`validate: true` (default) ≈ invalid requests get rejected.** It means *validation gets computed*. Rejection needs `validationFail` or `strict: true` *(documented: code comment)*.
3. **A passing schema ≈ correctly typed values in your handler.** With `coerceTypes: false` (default) an `integer` query param that validated still arrives as a string. Handlers that branch on `typeof` or do arithmetic get JavaScript coercion, not schema coercion *(maintainer, 2026-09)*.
4. **`quick: true` ≈ same guarantees, faster.** It skips OpenAPI document validation. A definition that normal mode would reject gets served as is *(documented: JSDoc "might break things")*.
5. **`strict: false` (default) ≈ lenient about handler names only.** It also swallows *definition load failures* (a typo in the file path gives you a warning and an instance that 404s everything) and it's what makes the missing-handler fall-through possible *(documented: code)*.
6. **`mockResponseForOperation` ≈ safe placeholder data.** It returns the definition's `example` / `examples` values *verbatim* (whatever the author put there, realistic-looking credentials and PII included) or `mock-json-schema` output. A `notImplemented` handler that mocks in production publishes those examples to every client. Misuse, not a library issue *(maintainer, 2026-09)*.
7. **`context.security[schemeName]` ≈ a verified identity.** It's whatever the handler returned, `{ error }` objects and `undefined` for unregistered schemes included. Only `context.security.authorized` is computed by the library *(documented: docs site)*.

**Attack classes every OpenAPI router/validator leaves to you:**

- *HTTP parameter pollution.* Repeated query keys become arrays. A single string gets auto-wrapped for `array` schemas. Don't assume scalar.
- *JSON Schema type confusion* (`"1"` vs `1`, `"true"` vs `true`). False friend 3.
- *Prototype pollution through body/query objects.* Whatever your framework parser allows reaches the handler. The library's own `qs` usage drops prototype keys, but `req.query` / `req.body` objects are taken as given.
- *Oversized bodies, slow-loris, deeply nested JSON.* Framework / platform layer.
- *ReDoS via schema `pattern`.* Definition is trusted. Copy a third-party definition and you inherit its regexes.
- *SSRF / local file read via `$ref`.* Definition is trusted. Load it from an untrusted path or URL and you crossed the boundary yourself.
- *Example data leaking through mocks.* False friend 6.

## 9. What do you need to do?

The contract from your side:

1. **Register `unauthorizedHandler`** whenever the definition declares any `security` requirement. Or set `strict: true`. Or check `c.security.authorized` at the top of every protected handler. Pick one. The warning tells you if you picked none.
2. **Register `validationFail`** (or `400`) if you rely on the schema to bound handler input. Or `strict: true`. Same deal.
3. **Register a security handler for every scheme in `components.securitySchemes`.** An unregistered scheme fails closed, but silently. `strict: true` turns unknown *handler names* into errors, not missing handlers.
4. **Wrap `handleRequest` in `try/catch`** (or `.catch`) and map rejections to an error response *(documented: #88)*. In strict mode that's where your 401 and 400 responses come from.
5. **Bound request size, depth and rate at the framework/platform layer.** The library assumes you did.
6. **Canonicalise the path before handing it over** if your routes could be confused by `..`, `//` or percent-encoded slashes. Pass the same form (raw vs decoded) every time.
7. **Treat the definition as code.** Load it from a path or object you control. Audit `pattern`s and external `$ref`s in third-party definitions before use. Never resolve a definition from a client-influenced location.
8. **Don't mock in production.** Or scrub `example` / `examples` first, unless the examples are meant to be public anyways.
9. **`coerceTypes` off? Treat every path/query value as a string** in your handlers. Or turn it on.
10. **Don't forward client values into `mockResponseForOperation(opts)` or `validateRequest(req, operationIdString)`** without allow-listing them against the definition.
11. **Keep `validate` on and `quick` off in security-sensitive deployments** unless you understand the trade (quick mode skips document validation).
12. **Don't mutate `c.operation` or `api.definition`** from handlers. They're shared across requests.

## 10. How does this library get misused?

- Security handler registered, no `unauthorizedHandler`, no `strict`, no `authorized` check in the operation handlers (the GHSA-7mmm-8m7g-cp5g shape). You'll see the warning on the first unauthorised request. Act on it.
- Relying on schema validation with no `validationFail` handler and no `strict`. Same warning.
- Returning `{ error: null, user }` from a security handler *is* the documented success pattern. Returning `{ error: '...', user: null }` is failure. Handlers that return arbitrary objects with an `error` key by accident (e.g. an upstream API response) fail closed and nobody knows why *(documented: commit `acf6e8c`)*.
- Treating path/query values as typed without `coerceTypes`.
- Mocking via `notImplemented` in production.
- Setting `validate` to a predicate keyed on a client-controlled header (the README example uses `x-internal-request`) without the proxy stripping that header from external traffic. The predicate then lets any client skip validation.
- Loading the definition from a URL or user-writable storage.
- Passing a `Request` whose `path` still has the framework mount prefix while `apiRoot` is `/` (or the reverse), getting universal 404s, then "fixing" it by loosening the framework route to `/*` and exposing every operation.

### 10a. What gets reported that isn't a bug?

Feed this to your scanner as a suppression list.

| Reported as | Why it's not a bug here |
| --- | --- |
| "`new RegExp` built from unescaped `path` template / `apiRoot`" (`router.ts`) | Templates and `apiRoot` are operator-authored (§5 trusted table). `OUT-OF-MODEL: trusted-input`. |
| "Ajv `strict: false` by default disables schema strictness" | Deliberate, to accept OpenAPI-flavoured schemas (`nullable`, `example`, `discriminator`) *(inferred, Q4)*. Override via `ajvOpts` if you want. `KNOWN-NON-FINDING`. |
| "Security scheme `X` has no handler and the request isn't rejected" / "Unauthenticated request reaches operation handler with `context.security.authorized === false`" | Missing handler = failed scheme (P1). Whether the request gets *rejected* depends on `unauthorizedHandler` / `strict` (§4a). Non-strict, no handler → `BY-DESIGN: property-disclaimed` (§8). Strict or handler registered → `VALID` (P2). |
| "Invalid body reaches operation handler" | Non-strict, no `validationFail` → `BY-DESIGN` (§8 false friend 2). Otherwise `VALID` (P4). |
| "Body under `text/plain` / `application/xml` / `multipart` isn't validated" | §8 "no content-type enforcement". `BY-DESIGN`. |
| "`JSON.parse` of request body without try/catch" (`validation.ts`) | It *is* wrapped. The error becomes a `parse` validation error. `KNOWN-NON-FINDING`. |
| "`JSON.parse` of a `content: application/json` query param without try/catch" (`router.ts`) | Wrapped since 5.21.0. Validation reports a `parse` error. `KNOWN-NON-FINDING`. |
| "External `$ref` resolution reads arbitrary files / does HTTP requests (SSRF)" | Definition is trusted. Refs are operator-authored. `OUT-OF-MODEL: trusted-input`. |
| "ReDoS in schema `pattern`" | Trusted definition. `OUT-OF-MODEL: trusted-input`. |
| "Prototype pollution via `__proto__` in query string" | `qs` defaults drop prototype keys (confirmed by probe). `KNOWN-NON-FINDING`. For object `req.query`, your framework's parser owns it: `OUT-OF-MODEL: adversary-not-in-scope` (§2). |
| "`console.warn` leaks definition errors" / "`console.warn` on an unauthorised request is a log injection or DoS vector" | Operator-facing stderr. The messages carry definition errors or the `operationId` from your definition, never client data, and the request-time ones fire once per instance. `KNOWN-NON-FINDING`. |
| "`handleRequest` on an un-initialised instance triggers file reads" | Documented auto-init. Target is operator-configured (§3 family A). `OUT-OF-MODEL: trusted-input`. |
| "Header/cookie `additionalProperties: true` lets unknown headers through" | Intentional. HTTP headers are open-ended. `additionalProperties: false` applies to path and query only (P4). `KNOWN-NON-FINDING`. |
| "Advisory in a devDependency / an `examples/*` dependency" | §2. `OUT-OF-MODEL: unsupported-component`. |

## 11. When does this model need a rewrite?

- A new `Request` field, or the library starting to parse a new encoding (XML, multipart bodies).
- **6.0 removing the non-strict fall-through.** Rewrites §4a, §8 bullets 2 and 3, §9 items 1 and 2, false friends 1, 2 and 5, and the GHSA-7mmm row below.
- The library gaining a network or filesystem surface at request time (remote definition reloads, OIDC discovery in a built-in security handler).
- Reference security handlers shipping in core (planned in issue #31, item 4). They'd become in-model authentication code and the first bullet of §2 stops being true.
- A change in Ajv defaults (`strict`, `coerceTypes` on the params validator) or in `qs` parsing options.
- Anything from the `examples` branch getting promoted into the package.
- **Evidence the model is incomplete:** any report that can't be routed to exactly one §12 disposition. Fix by editing §7 or §8, not by ad-hoc triage.

## 12. How do we triage a report?

Closed set. A report that doesn't fit isn't "other", it's `MODEL-GAP`.

| Disposition | Meaning | Licensed by |
| --- | --- | --- |
| `VALID` | Breaks P1 to P8 via the client adversary and an in-model input. | §7, §5, §6 |
| `VALID-HARDENING` | No property broken, but a §10 misuse is easy enough that we choose to harden. Private report, maintainer discretion, typically no CVE. | §10 |
| `OUT-OF-MODEL: trusted-input` | Needs control of the definition, options, handlers, `handlerArgs` or `mockResponseForOperation` arguments. | §5 |
| `OUT-OF-MODEL: adversary-not-in-scope` | Needs in-process, side channel, co-tenant or definition-author capability. | §6 |
| `OUT-OF-MODEL: unsupported-component` | Lands in the `examples` branch, test fixtures, `sbom/`, `scripts/`. | §2 |
| `OUT-OF-MODEL: non-default-build` | Only shows up under a weakening `ajvOpts` / `customizeAjv`. | §4a |
| `BY-DESIGN: property-disclaimed` | About a §8 non-property or false friend. Includes the non-strict fall-through in 5.x. | §8 |
| `KNOWN-NON-FINDING` | Matches a §10a row. | §10a |
| `MODEL-GAP` | Doesn't route cleanly. Revise the model. | §11 |

**Does the model survive contact with real reports?** Three so far:

| Report | Disposition | Section |
| --- | --- | --- |
| GHSA-j939-289f-wq4w: multi-key `{ error, … }` treated as authorised (fixed 5.18.0) | `VALID` | P1 |
| GHSA-7mmm-8m7g-cp5g: fail-open without `unauthorizedHandler` | `VALID-HARDENING`. Non-strict fall-through stays by design in 5.x. Hardened in 5.21.0: once-only warning, and `strict: true` rejects. Fail-closed unconditionally in 6.0. The advisory should be updated to say so and credit EQSTLab. | §4a, §8, P2 |
| GHSA-4v89-4c72-fxv7: `TypeError` on `?limit[a]=1` with `explode: false` | `VALID` (availability, P6). Fixed in 5.17.0 (commit `5450967`). The advisory still says "patched: none" and should be updated with 5.17.0 and credit kq5y. The sibling `JSON.parse` case is fixed in 5.21.0. | P6 |

Three out of three route cleanly. 🙏

## 13. What still needs deciding?

Only four left, none of which change a triage outcome.

1. **`mockResponseForOperation` / `validateRequest(…, operationIdString)` arguments are trusted.** *Proposed:* yes. The only reason to say otherwise would be to add prototype key guards on the definition lookups. → §5.
2. **Edge probe of P1.** A scheme name listed in `security` but missing from `components.securitySchemes`: with `quick: true` the document validator doesn't catch this, and the requirement is then always-failed (no handler can be registered for it in strict mode, and it fails silently in non-strict). Is that how it should look like, or should `init` warn? → P1, §4a.
3. **Ownership and revision.** *Proposed:* the maintainer owns this file. It gets updated in the same PR as any change listed in §11. The confidence line gets updated as questions close. → header.
4. **Ajv `strict: false` default.** *Proposed:* "Deliberate. OpenAPI schemas carry keywords Ajv strict mode rejects (`nullable`, `example`, `discriminator`, `xml`). Operators who want strict Ajv set it in `ajvOpts`." → §10a.

Note to self: Q2 becomes interesting once the 6.0 fail-closed change lands. Decide it then.

---

### Appendix: provenance count

Documented: 33 · Maintainer: 34 · Inferred: 2. The inferred claims map to Q1 and Q4. Q2 probes an edge of a documented claim, Q3 is meta. Neither has a body claim behind it.
