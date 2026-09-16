# openapi-backend Threat Model

| | |
| --- | --- |
| **Project** | `openapi-backend` (npm), https://github.com/openapistack/openapi-backend |
| **Version / commit** | 5.20.3 / `0adc950` (`main`, 2026-09-15) |
| **Date** | 2026-09-16 |
| **Status** | **Draft.** Not ratified yet. Don't cite this as policy until the wave 1 questions in §4.14 are answered. |
| **Version binding** | This model ships with the package. A report against version N gets triaged against the model as it was at N, not at `main`. |
| **Reporting** | Breaks a §4.8 property? Report it privately per [SECURITY.md](../SECURITY.md). Lands in §4.3 or §4.9? It gets closed citing this document. |
| **Provenance legend** | *(documented)* = stated in the project's own artifacts (README, docs site, code comments, tests, commit messages, advisories, maintainer comments on issues). *(maintainer)* = answered in §4.14. *(inferred)* = my reading of the code, not confirmed yet, has a matching question in §4.14. |
| **Draft confidence** | 37 documented / 0 maintainer / 31 inferred |

## What is this document?

The unwritten contract between openapi-backend and whoever drops it into their API.

openapi-backend takes an OpenAPI 3.0/3.1 document and, for every request your framework (Express, Fastify, Koa, Hapi, Lambda, Azure Functions) hands it, does four things: routes the request to the operation the document declares, runs your security handlers and combines the results, validates the request against the JSON Schemas with Ajv, and calls your operation handler. It can also validate responses and mock responses from examples or schemas.

It does not open sockets, parse HTTP or write responses. Your framework does that.

Two readers: the integrator who wants to know which threats are theirs now, and the triager who needs to close a report by citing a section instead of arguing.

---

## 4.2 What is this library for?

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
| **A. Definition loading** | `init`, `loadDocument`, `validateDefinition`, `refparser.ts`, `dereference-json-schema` (quick mode) | **Yes.** Reads local files and fetches HTTP(S) URLs to resolve external `$ref`s via `@apidevtools/json-schema-ref-parser` (default `resolve.external: true`) *(inferred from dependency defaults)* | In, as a **trusted-input** boundary (§4.4) |
| **B. Router** | `matchOperation`, `parseRequest`, `normalizeRequest`, `normalizePath` (`router.ts`) | No | **In. Primary attack surface.** |
| **C. Request validator** | `validateRequest`, `buildRequestValidatorsForOperation`, Ajv instances (`validation.ts`) | No | **In. Primary attack surface.** |
| **D. Lifecycle & auth aggregation** | `handleRequest`, security handler evaluation, `register*` (`backend.ts`) | No (calls your code) | **In. Primary attack surface.** |
| **E. Response validation** | `validateResponse`, `validateResponseHeaders` | No | In, as a correctness feature only (§4.9) |
| **F. Mocking** | `mockResponseForOperation`, `mock-json-schema` | No | In, trusted input only (§4.6) |
| **G. Examples** (`examples` branch, 14 projects) | | Yes (real servers) | **Out** (§4.3) |
| **H. Test fixtures, SBOM, scripts** | | | **Out** (§4.3) |

## 4.3 What is out of scope?

- **Authentication and authorisation decisions.** The library never looks at a credential. It calls your security handlers and combines their results per the OpenAPI security requirement semantics. Whether a token is valid is your handler's problem *(documented: README "Auth / Security Handlers"; issue #31 design plan)*.
- **Transport, TLS, HTTP parsing, request size limits, timeouts, rate limiting, compression.** Framework or platform *(inferred: no code touches any of it)*.
- **Error handling for thrown errors.** "I've designed the library to be agnostic towards error handling. You can perform exception handling either within the operation handlers or simply catch from `handleRequest`" *(documented: maintainer, issue #88; again in #110)*.
- **Hostile OpenAPI definitions.** The definition is your config. Anything that needs an attacker to author or edit the definition, `apiRoot`, `ajvOpts`, `customizeAjv` or any handler is out of model (§4.7). That includes SSRF / local file read through external `$ref`s, ReDoS through schema `pattern`s and schemas that make Ajv compile slowly *(inferred)*.
- **Your framework's body/query parser.** Prototype pollution, depth and size behaviour of the objects it hands over as `req.body` / `req.query` *(inferred)*.
- **Response body confidentiality.** Response validation is a dev aid, not a data leak control. I don't use runtime response validation in production myself *(documented: maintainer, issue #384)*.
- **Shipped but unsupported code.** The `examples` branch is "separate from the library source on `main`" *(documented: examples branch README)*. Example servers, their dependencies and their auth setups are modelled by whoever copies them. Test fixtures, the SBOM and `scripts/` are not runtime code.
- **Supply chain and build hygiene.** Dependency advisories, CI pinning, SBOM accuracy. Important, not a threat model topic.

## 4.4 Where is the trust boundary?

**The `Request` object. That's it.** Everything the client controls comes in through the five fields of `Request` (`method`, `path`, `headers`, `query`, `body`) passed to `handleRequest`, `matchOperation` or `validateRequest`. Everything else the library reads (definition, options, handlers, `handlerArgs`) is on the trusted side *(inferred)*.

**How a request flows** (`handleRequest` in `backend.ts`):

1. `Request` (untrusted) → `router.parseRequest` → `context.request`. Still untrusted, just tidier: lower-cased headers, parsed cookies, parsed query, JSON-parsed string body.
2. `preRoutingHandler` (your code, sees untrusted data).
3. `router.matchOperation`: untrusted `method` + `path` vs trusted path templates → `context.operation` (trusted) or 404/405.
4. `parseRequest` again with the operation. Path params get percent-decoded by `bath-es5` *after* matching. Query params get per-parameter decoding.
5. Security handlers (your code) run **concurrently for every scheme named in any requirement object**. They get the untrusted `context`, return results → `context.security.authorized` (computed by the library).
6. `unauthorizedHandler` if registered and `authorized === false` → **early return**. Otherwise fall through (§4.5a, §4.9).
7. Validation → `context.validation`. `validationFail` if registered and there are errors → **early return**. Otherwise fall through *(documented: code comment in `backend.ts`, "if no validation handler is specified, just ignore it and proceed to route handler")*.
8. `preOperationHandler`, the operation handler or `notImplemented`, `postResponseHandler`. Return values are opaque to the library.

The library never turns untrusted data into trusted data. `context.security.authorized` and `context.validation.valid` are the only verdicts the library computes, and **both are advisory unless the matching early-return handler is registered** *(documented: test "sets security handler results to undefined if no handler is registered" in `backend.test.ts` reaches `notImplemented`; unmerged branch `docs/clarify-authorization-enforcement`; GHSA-7mmm-8m7g-cp5g closed without a patch)*.

**Reachability test per family.** First thing a triager checks:

| Family | A finding matters only if… |
| --- | --- |
| A (loading) | it's reachable with an operator-authored definition and options. Needs a malicious definition? `OUT-OF-MODEL: trusted-input`. Note: an un-initialised instance auto-inits on the first `handleRequest` *(documented: code comment)*, so a client can control *when* files/URLs get read, but never *which*. |
| B, C, D | it's reachable from the five `Request` fields with any well-formed definition and default options, **or** with a non-default option I haven't declared dev-only (§4.5a). |
| E | it's reachable from an operator-supplied response object. Client data only gets here if your handler copies it into the response. |
| F | it's reachable from `operationId` / `opts` values you sourced from the client. Default usage (`c.operation.operationId`) is trusted. |

## 4.5 What does the library assume about its host?

- **Runtime:** Node ≥ 20 *(documented: `package.json`)*. No native code. No browser support claimed.
- **Concurrency:** one `OpenAPIBackend` instance is shared across all concurrent requests. Per-request state lives in the `context` object only. The one bit of mutable instance state touched at request time is the lazy validator cache (`requestValidators` etc.) in `quick` / lazy mode. Two concurrent first requests may compile the same validator twice. Harmless *(inferred)*. Handler maps are copied at construction so your objects don't get mutated *(documented: code comment and test "copies objects passed to constructor")*.
- **Clock:** not used *(inferred)*.
- **Filesystem / network:** family A only (§4.2), only for the definition path and the external `$ref`s it names *(inferred)*.
- **What it does NOT do to your process.** All *(inferred)*, all wave 1 confirmation targets:
  - never opens listening sockets, spawns processes, installs signal handlers, reads env vars or touches global state (except binding three `$RefParser` methods at module load);
  - never touches filesystem or network at request time (except the auto-init case above);
  - writes to `console.warn` at init only (non-strict mode swallows init errors this way) and when you register a handler for an unknown operationId/scheme in non-strict mode. Never writes to stdout at request time;
  - doesn't mutate the `Request` you pass in (it spreads and clones). But it **does** hand out the live dereferenced definition objects via `context.operation`. A handler that mutates `c.operation` mutates the shared definition.

### 4.5a Which options change the security envelope?

No compile-time flags. Runtime knobs that matter:

| Knob | Default | What changes | Ruling |
| --- | --- | --- | --- |
| `unauthorizedHandler` registered | **no** | Not registered: a request that fails its security requirements continues to validation and the operation handler with `context.security.authorized === false` *(documented: §4.4)*. Registered: such requests never reach the operation handler *(documented: tests)*. | **Needed, wave 1 (Q1).** Evidence points to "you must register it": GHSA-7mmm-8m7g-cp5g (Critical, "fail-open when `unauthorizedHandler` is not registered") was **closed with no patch**, and the same day a docs clarification was drafted saying security handlers "do not automatically stop request handling". If ratified: §4.10 carries the requirement and such reports are `BY-DESIGN: property-disclaimed`. |
| `validationFail` registered | **no** | Not registered: requests failing schema validation go on to the operation handler. `context.validation.valid === false` is the only signal *(documented: code comment)*. | Same shape as above. **Wave 1 (Q2).** |
| `validate` | `true` | `false` disables validation and skips compiling validators. A predicate can skip validation (and so coercion) per request *(documented: README, docs site)*. | Documented as a supported production choice ("skip validation for internal traffic"). |
| `strict` | `false` | Non-strict swallows definition load/validation errors (`console.warn`) and carries on with an undefined or partial definition. Every route then 404s. Also only warns on unknown handler names *(documented: JSDoc and code)*. | Probably dev convenience. **Q3.** |
| `quick` | `false` | Skips `validateDefinition`, uses a sync dereferencer, compiles validators lazily at first request *(documented: JSDoc, "attempts to optimise startup; might break things")*. Recommended for serverless *(documented: docs site)*. | Supported. A `quick` deployment is in model. |
| `coerceTypes` | `false` | `true`: Ajv-coerced path/query values replace `context.request.params/query`. `false`: **validation still runs Ajv with `coerceTypes: true` on the params schema, so `"1"` validates as `integer` but your handler gets the string** *(inferred from `getAjv(ValidationContext.Params, { coerceTypes: true })` in `validation.ts`; confirmed by probe)*. | **Q4.** Is "validates as integer, delivered as string" intended? |
| `ajvOpts` / `customizeAjv` | `{ strict: false }` / none | You can weaken or strengthen everything Ajv does (`removeAdditional`, `useDefaults`, formats, `unicodeRegExp`, custom keywords). Trusted. | Out of model when non-default and weakening (§4.7). |
| `ignoreTrailingSlashes` | `true` | `/pets/` and `/pets` route the same. | Documented default. |
| `apiRoot` | `/` | Operator string, inserted unescaped into a `RegExp` for prefix stripping. Trusted. | |

**The insecure default problem.** The two unregistered handlers above are the only defaults that void a security property. This model can't be published before I rule on them. My provisional reading is "you must register them", based on the advisory closure. But that's a ruling, not a fact yet.

## 4.6 What inputs does the library accept, and from whom?

**`handleRequest(req, ...handlerArgs)`** (same for `matchOperation`, `validateRequest`):

| Field | Attacker controls it? | What the library does with it | You must enforce |
| --- | --- | --- | --- |
| `req.method` | **yes** | trims, lower-cases; only `get put post delete options head patch trace` can match | nothing |
| `req.path` | **yes** | trims, prefixes `/`, drops everything from the first `?`, strips `apiRoot`, strips trailing `/`. **No percent-decoding, no `..` or `//` normalisation before matching.** Path params get percent-decoded *after* the segment matched `[^/]+` (so `a%2Fb` is one segment that decodes to `a/b`) *(inferred; confirmed by probe)* | canonicalisation if your app cares about `..`, `//` or encoded slashes. Frameworks normally give a decoded or raw path consistently |
| `req.headers` | **yes** | keys lower-cased; `cookie` parsed with `cookie.parse`; `content-type === 'application/json'` (exact match, no parameters) decides whether a non-object body gets validated | header size limits (framework) |
| `req.query` (object) | **yes** | deep-cloned as is. **Nested objects and arrays are whatever your framework produced** | framework query parser limits |
| `req.query` (string) or `?…` in path | **yes** | parsed by `qs` with defaults (`depth 5`, `parameterLimit 1000`, `arrayLimit 20`, prototype keys dropped) *(inferred; confirmed by probe)* | nothing beyond framework limits |
| `req.body` (object) | **yes** | used as is (framework-parsed) | body size/depth limits (framework) |
| `req.body` (string/Buffer) | **yes** | `JSON.parse` attempted. Failure is swallowed at parse time and surfaces as a `parse` validation error only when the operation's sole content type is `application/json` | body size limit (framework) |
| `req.params` | ignored | overwritten by the library's own path param parsing | |
| `handlerArgs` | no, operator | passed through verbatim to every handler | |

Per-parameter query handling that runs on attacker data *before* validation: `JSON.parse` on a parameter declared with `content: application/json` (uncaught, see §4.8 P6) and delimiter splitting for `explode: false` (guarded to strings since the fix for GHSA-4v89-4c72-fxv7).

**Trusted-only entry points.** Every argument is operator-sourced by contract:

| Function | Parameter | Attacker controls it? | Note |
| --- | --- | --- | --- |
| `new OpenAPIBackend(opts)` | all of `opts` | no | definition can be a file path or URL, resolved at `init` |
| `register*`, `registerSecurityHandler` | names, functions | no | |
| `mockResponseForOperation` | `operationId`, `opts.code/mediaType/example` | **no, trusted by contract.** If you forward client values here, the lookups are plain property reads on the definition (`responses[opts.code]`, `examples[opts.example]`) with no prototype key guard *(inferred)* | see §4.11 |
| `validateRequest(req, operation)` | `operation` (string/object) | no | `req` is untrusted as above |
| `validateResponse*` | `res`, `headers`, `operation`, `statusCode` | no | |

**Size, shape, rate:** nothing enforced. Validation cost is whatever Ajv does with your schema against a body your framework already bounded *(inferred)*. Routing is O(number of operations) per request with a fresh `RegExp` per template *(inferred)*.

## 4.7 Who is the attacker?

**In scope: the unauthenticated network client.** Controls every byte of `method`, `path`, `headers`, `query`, `body` (modulo your framework's parsing). Can send as many requests as they like. What they want: reach an operation handler without satisfying its security requirements, reach a handler with data the schema should have rejected, get routed to a different operation than the path/method says, make `handleRequest` throw or hang, pull definition content they shouldn't see *(inferred)*.

**In scope, weaker: the client of a `notImplemented`-mocked API.** Same capabilities. Goal: extract example data (§4.9).

**Out of scope:**

- Anyone who can author or alter the definition, options or handler code. That's the operator *(inferred; follows from §4.3)*.
- In-process code (other modules, the framework). Already won *(inferred)*.
- Side channel and timing observers. The library compares no secrets *(inferred)*.
- Co-tenants, container escapes, OS-level attackers.
- Anyone who can make `init` load a definition from a path or URL they control. That's operator misconfiguration (§4.11).

## 4.8 What does the library guarantee?

Only properties the project has actually committed to. No inventing.

| # | Property (and when it holds) | What a break looks like | Severity | Provenance |
| --- | --- | --- | --- | --- |
| **P1** | **Security requirement semantics.** For a matched operation, `context.security.authorized` is `true` iff at least one Security Requirement Object in the operation's (or, failing that, the document's) `security` list has *every* named scheme's handler result truthy and not an object with a truthy `error`. Scheme with no registered handler → *failed*. Handler threw or rejected → *failed*. Results are per request. | `authorized === true` when a required scheme's handler returned falsy, returned `{ error: <truthy>, … }`, threw or was unregistered. Or `authorized === false` when the spec's OR/AND says it should pass. | **Security-critical.** Fail-open = CVE. GHSA-j939-289f-wq4w was fixed and published as High. | *(documented: docs site "Auth with Security Handlers"; commit `834158d` "fail-open authorization flaw"; tests)* |
| **P2** | **Enforcement gate when `unauthorizedHandler` is registered.** With it registered, a request with `authorized === false` and a non-empty requirement list never reaches validation, `preOperationHandler` or the operation handler. | Operation handler runs despite `authorized === false` and a registered `unauthorizedHandler`. | **Security-critical** | *(documented: test "does not call operation handler if requirements are not met and unauthorizedHandler is defined")* |
| **P3** | **Routing fidelity.** A request goes to the operation whose path template and method it matches under the normalisation in §4.6: exact path first, then the most specific template. No template matches → 404 handling. Path matches, method doesn't → 405 handling. Path param values are exactly the matched segment, percent-decoded. | A request reaching an operation its template doesn't match (route confusion), or path params with bytes from outside the matched segment. | **Security-critical** when it changes which handler (and so which `security` list) applies. Correctness-only otherwise. | *(inferred: tests cover matching and specificity but nothing calls it a security property)* |
| **P4** | **Validation gate when `validationFail` is registered and `validate` is on for the request.** A request doesn't reach the operation handler if its path/query/header/cookie parameters or its `application/json` body (when `content-type` is exactly `application/json` or the framework gave an object body) fail the operation's schema. Unknown query and path params are rejected (`additionalProperties: false`). Unknown headers and cookies are allowed. `required` params are enforced for all four locations. | `validationFail` not called for input the schema rejects, under the stated conditions. | **Security-critical** when the bypass is reachable from `Request` fields (validation is what integrators rely on to bound handler input). Correctness-only for over-rejection. **Tier to confirm (Q5).** | *(documented: README "Request validation"; tests)* for the mechanism; *(inferred)* for the tier |
| **P5** | **No mutation of your objects.** Constructor `handlers` / `securityHandlers` maps and the `Request` object are not mutated. | Your object changed after a call. | Correctness-only | *(documented: code comments, test "copies objects passed to constructor")* |
| **P6** | **Error contract.** `handleRequest` reports failure by *rejecting the promise* with an `Error`. It never crashes the process itself, never swallows a thrown handler error, never returns a fake success. Rejection is the *documented* outcome for: unmatched route with no `notFound` handler, no handler for the operation and no `notImplemented`, any throw from your handlers *(documented: code; maintainer #88, "simply catch from `handleRequest`")*. **Open question: is rejecting on malformed client input at the parse stage inside this contract?** GHSA-4v89-4c72-fxv7 (Moderate, `TypeError` on `?limit[a]=1` with `explode: false`) sits in *Triage* and its guard is on `main`, which reads as "parse-stage throws are bugs". The same shape remains for a query param declared with `content: application/json` and a malformed value (`JSON.parse` in `parseRequest`, uncaught; probe rejects with `SyntaxError`). | Unhandled rejection, process exit or a hanging request. | **Availability, request-scoped.** I need to say whether "one request can make `handleRequest` reject before validation" is `VALID` (then P6 becomes "resolves, or rejects with a validation error, for every well-typed `Request`") or `BY-DESIGN` (caller catches). **Wave 1 (Q6).** | *(documented: #88/#110 for the catch contract; inferred for the parse-stage boundary)* |
| **P7** | **No code evaluation of client data.** Client bytes only ever get `JSON.parse`d, string-split, regex-matched against operator templates and schema-validated. Never `eval`ed, never used to build a `RegExp`, never used as a file path or URL. | Any of those. | **Security-critical** | *(inferred)* |
| **P8** | **Resource use.** *No guarantee.* The library doesn't bound body size, nesting depth, query param count beyond `qs` defaults or validation CPU. Super-linear behaviour in request size is a bug only if I say so. | Hang or unbounded memory on a size-bounded request. | **Ruling needed (Q7).** Provisional line: a hang or process crash on a size-bounded request is a bug. Slow is not. | *(inferred)* |

## 4.9 What does the library NOT do?

The most useful section for an integrator. Read this one twice.

- **No authentication or authorisation.** Security handlers are your code. Declaring `securitySchemes` and `security` in the definition blocks nothing on its own *(documented: docs site; README)*.
- **No enforcement of `authorized === false` without `unauthorizedHandler`** (pending Q1). The operation handler runs and has to check `c.security.authorized` itself *(documented: §4.4 sources)*.
- **No enforcement of validation errors without `validationFail`** (pending Q2) *(documented: code comment)*.
- **No content-type enforcement.** Only an `application/json` body (or an object body from the framework) is schema-validated. A body sent as any other media type, or as `application/json; charset=utf-8` in raw string form, goes to your handler unvalidated. Media types the operation doesn't declare are not rejected either *(inferred: code; issue #229 open, no ruling)*.
- **No request size, depth, count or rate limits. No timeouts.** (§4.8 P8)
- **No path canonicalisation** (§4.6). `/a/../b`, `/a//b` and `/%61` are three different paths to this router, whatever your proxy thinks.
- **No isolation between security handlers.** All handlers named anywhere in the requirement list run concurrently for every request, even for requirement objects that won't be needed. A handler with side effects (rate limit counters, audit logs, token introspection calls) runs regardless of the outcome *(inferred: `Promise.all` in `handleRequest`)*.
- **No constant-time comparison, hashing, signing or randomness.** Zero crypto in the library. Whatever a handler compares, handler code compares *(inferred)*.
- **No protection of the definition from its own consumers.** `context.operation` and `api.definition` are the live dereferenced objects. Handlers can mutate them *(inferred)*.
- **No runtime response validation by default.** When you opt in it's a schema check, not a filter: it doesn't strip unexpected fields, `validateResponse` without a `statusCode` accepts a body matching *any* declared response's schema, and a body for an undeclared status isn't checked at all *(documented: README; issue #384 open, maintainer: "don't really see any need for runtime response validation")*.

**False friends.** Things that look like a control but aren't:

1. **`security:` in the definition ≈ auth enforcement.** It's a *list of handler names to consult*. Enforcement needs a registered handler for each scheme *and* `unauthorizedHandler` (or a check inside every operation handler). "Bypass" reports that boil down to this config are the single most common report shape against this project (GHSA-7mmm-8m7g-cp5g) *(documented)*.
2. **`validate: true` (default) ≈ invalid requests get rejected.** It means *validation gets computed*. Rejection needs `validationFail` *(documented: code comment)*.
3. **A passing schema ≈ correctly typed values in your handler.** With `coerceTypes: false` (default) an `integer` query param that validated still arrives as a string *(inferred; confirmed by probe)*. Handlers that branch on `typeof` or do arithmetic get JavaScript coercion, not schema coercion.
4. **`quick: true` ≈ same guarantees, faster.** It skips OpenAPI document validation. A definition that normal mode would reject gets served as is *(documented: JSDoc "might break things")*.
5. **`strict: false` (default) ≈ lenient about handler names only.** It also swallows *definition load failures*: a typo in the file path gives you a warning and an instance that 404s everything, not an exception *(documented: code)*.
6. **`mockResponseForOperation` ≈ safe placeholder data.** It returns the definition's `example` / `examples` values *verbatim* (whatever the author put there, realistic-looking credentials and PII included) or `mock-json-schema` output. A `notImplemented` handler that mocks in production publishes those examples to every client *(inferred)*.
7. **`context.security[schemeName]` ≈ a verified identity.** It's whatever the handler returned, `{ error }` objects and `undefined` for unregistered schemes included. Only `context.security.authorized` is computed by the library *(documented: docs site)*.

**Attack classes every OpenAPI router/validator leaves to you:**

- *HTTP parameter pollution.* Repeated query keys become arrays. A single string gets auto-wrapped for `array` schemas. Don't assume scalar.
- *JSON Schema type confusion* (`"1"` vs `1`, `"true"` vs `true`). False friend 3.
- *Prototype pollution through body/query objects.* Whatever your framework parser allows reaches the handler. The library's own `qs` usage drops prototype keys, but `req.query` / `req.body` objects are taken as given.
- *Oversized bodies, slow-loris, deeply nested JSON.* Framework / platform layer.
- *ReDoS via schema `pattern`.* Definition is trusted. Copy a third-party definition and you inherit its regexes.
- *SSRF / local file read via `$ref`.* Definition is trusted. Load it from an untrusted path or URL and you crossed the boundary yourself.
- *Example data leaking through mocks.* False friend 6.

## 4.10 What do you need to do?

The contract from your side:

1. **Register `unauthorizedHandler`** whenever the definition declares any `security` requirement. Or check `c.security.authorized` at the top of every protected handler. (Pending Q1, provisional.)
2. **Register `validationFail`** (or check `c.validation.valid` in every handler) if you rely on the schema to bound handler input. (Pending Q2, provisional.)
3. **Register a security handler for every scheme in `components.securitySchemes`.** An unregistered scheme fails closed, but silently. `strict: true` turns unknown *handler names* into errors, not missing handlers.
4. **Wrap `handleRequest` in `try/catch`** (or `.catch`) and map rejections to an error response *(documented: #88)*. Don't let a rejection reach Node's unhandled rejection path.
5. **Bound request size, depth and rate at the framework/platform layer.** The library assumes you did.
6. **Canonicalise the path before handing it over** if your routes could be confused by `..`, `//` or percent-encoded slashes. Pass the same form (raw vs decoded) every time.
7. **Treat the definition as code.** Load it from a path or object you control. Audit `pattern`s and external `$ref`s in third-party definitions before use. Never resolve a definition from a client-influenced location.
8. **Don't mock in production.** Or scrub `example` / `examples` first, unless the examples are meant to be public anyways.
9. **`coerceTypes` off? Treat every path/query value as a string** in your handlers. Or turn it on.
10. **Don't forward client values into `mockResponseForOperation(opts)` or `validateRequest(req, operationIdString)`** without allow-listing them against the definition.
11. **Keep `validate` on and `quick` off in security-sensitive deployments** unless you understand the trade (quick mode skips document validation).
12. **Don't mutate `c.operation` or `api.definition`** from handlers. They're shared across requests.

## 4.11 How does this library get misused?

Draft one-liners. Expand before publishing.

- Security handler registered, no `unauthorizedHandler`, no `authorized` check in the operation handlers (the GHSA-7mmm-8m7g-cp5g shape).
- Relying on schema validation with no `validationFail` handler.
- Returning `{ error: null, user }` from a security handler *is* the documented success pattern. Returning `{ error: '...', user: null }` is failure. Handlers that return arbitrary objects with an `error` key by accident (e.g. an upstream API response) fail closed and nobody knows why *(documented: commit `acf6e8c`)*.
- Treating path/query values as typed without `coerceTypes`.
- Mocking via `notImplemented` in production.
- Setting `validate` to a predicate keyed on a client-controlled header (the README example uses `x-internal-request`) without the proxy stripping that header from external traffic. The predicate then lets any client skip validation.
- Loading the definition from a URL or user-writable storage.
- Passing a `Request` whose `path` still has the framework mount prefix while `apiRoot` is `/` (or the reverse), getting universal 404s, then "fixing" it by loosening the framework route to `/*` and exposing every operation.
- One instance per request. Defeats validator caching. Not a security issue, but it's how `quick` mode ends up compiling under load.

### 4.11a What gets reported that isn't a bug?

Feed this to your scanner as a suppression list.

| Reported as | Why it's not a bug here |
| --- | --- |
| "`new RegExp` built from unescaped `path` template / `apiRoot`" (`router.ts`) | Templates and `apiRoot` are operator-authored (§4.6 trusted table). `OUT-OF-MODEL: trusted-input`. |
| "Ajv `strict: false` by default disables schema strictness" | Deliberate, to accept OpenAPI-flavoured schemas (`nullable`, `example`, `discriminator`) *(inferred)*. Override via `ajvOpts` if you want. Not a vulnerability. |
| "Security scheme `X` has no handler and the request isn't rejected" | Missing handler = failed scheme (P1). Whether the request gets *rejected* depends on `unauthorizedHandler` (§4.5a). Disposition follows Q1. Today: `BY-DESIGN: property-disclaimed` (§4.9). |
| "Unauthenticated request reaches operation handler; `context.security.authorized === false`" | Same. GHSA-7mmm-8m7g-cp5g was closed on this basis. |
| "Invalid body reaches operation handler" | Needs `validationFail` (§4.9 false friend 2). `BY-DESIGN`. |
| "Body under `text/plain` / `application/xml` / `multipart` isn't validated" | §4.9 "no content-type enforcement". `BY-DESIGN` pending #229. |
| "`JSON.parse` of request body without try/catch" (`validation.ts`) | It *is* wrapped. The error becomes a `parse` validation error. `KNOWN-NON-FINDING`. |
| "External `$ref` resolution reads arbitrary files / does HTTP requests (SSRF)" | Definition is trusted. Refs are operator-authored. `OUT-OF-MODEL: trusted-input`. |
| "ReDoS in schema `pattern`" | Trusted definition. `OUT-OF-MODEL: trusted-input`. |
| "Prototype pollution via `__proto__` in query string" | `qs` defaults drop prototype keys (confirmed by probe). For object `req.query`, your framework's parser owns it (§4.3). |
| "`console.warn` leaks definition validation errors" | Init time, operator-facing stderr, non-strict mode only. Not a client-reachable channel. |
| "`handleRequest` on an un-initialised instance triggers file reads" | Documented auto-init. Target is operator-configured (§4.4 family A). |
| "Header/cookie `additionalProperties: true` lets unknown headers through" | Intentional. HTTP headers are open-ended. `additionalProperties: false` applies to path and query only (P4). |
| "Advisory in a devDependency / an `examples/*` dependency" | §4.3. `OUT-OF-MODEL: unsupported-component`. |
| "`handleRequest` rejects with `TypeError` / `SyntaxError` on a crafted query string" | **Not a non-finding yet.** Routed by Q6. Until answered it's `MODEL-GAP` and gets triaged conservatively (GHSA-4v89-4c72-fxv7 precedent). |

## 4.12 When does this model need a rewrite?

- A new `Request` field, or the library starting to parse a new encoding (XML, multipart bodies, `application/json` with parameters).
- Any change to the `unauthorizedHandler` / `validationFail` fall-through (e.g. a fail-closed default). That invalidates §4.5a, §4.9, §4.10 and the dispositions of past reports.
- The library gaining a network or filesystem surface at request time (remote definition reloads, OIDC discovery in a built-in security handler).
- Reference security handlers shipping in core (planned in issue #31, item 4). They'd become in-model authentication code and the first bullet of §4.3 stops being true.
- A change in Ajv defaults (`strict`, `coerceTypes` on the params validator) or in `qs` parsing options.
- Anything from the `examples` branch getting promoted into the package.
- **Evidence the model is incomplete:** any report that can't be routed to exactly one §4.13 disposition. Q6 (parse-stage rejection) is already one. Fix by editing P6, not by ad-hoc triage.

## 4.13 How do we triage a report?

Closed set. A report that doesn't fit isn't "other", it's `MODEL-GAP`.

| Disposition | Meaning | Licensed by |
| --- | --- | --- |
| `VALID` | Breaks P1 to P7 via the client adversary and an in-model input. | §4.8, §4.6, §4.7 |
| `VALID-HARDENING` | No property broken, but a §4.11 misuse is easy enough that we choose to harden (e.g. warn at `init` when `security` is declared but no `unauthorizedHandler` is registered). Private report, maintainer discretion, typically no CVE. | §4.11 |
| `OUT-OF-MODEL: trusted-input` | Needs control of the definition, options, handlers, `handlerArgs` or `mockResponseForOperation` arguments. | §4.6 |
| `OUT-OF-MODEL: adversary-not-in-scope` | Needs in-process, side channel, co-tenant or definition-author capability. | §4.7 |
| `OUT-OF-MODEL: unsupported-component` | Lands in the `examples` branch, test fixtures, `sbom/`, `scripts/`. | §4.3 |
| `OUT-OF-MODEL: non-default-build` | Only shows up under a weakening `ajvOpts` / `customizeAjv`, or under a default I've declared dev-only (pending Q1 to Q3). | §4.5a |
| `BY-DESIGN: property-disclaimed` | About a §4.9 non-property or false friend. | §4.9 |
| `KNOWN-NON-FINDING` | Matches a §4.11a row. | §4.11a |
| `MODEL-GAP` | Doesn't route cleanly. Revise the model. | §4.12 |

**Does the model survive contact with real reports?** Three so far:

| Report | Disposition | Section |
| --- | --- | --- |
| GHSA-j939-289f-wq4w: multi-key `{ error, … }` treated as authorised (fixed 5.18.0) | `VALID` | P1 |
| GHSA-7mmm-8m7g-cp5g: fail-open without `unauthorizedHandler` (closed, no patch) | `BY-DESIGN: property-disclaimed` *provisionally*. Becomes `VALID` if Q1 goes the other way. | §4.5a, §4.9 |
| GHSA-4v89-4c72-fxv7: `TypeError` on `?limit[a]=1` with `explode: false` (Triage, guard on `main`) | `MODEL-GAP`, resolved by Q6. The shipped guard suggests `VALID` (availability). | P6 |

Two out of three route cleanly. The third is the gap this model exists to close.

## 4.14 What still needs deciding?

Every *(inferred)* tag above lands here. Each question comes with my proposed answer. Confirm, correct or strike.

**Wave 1: scope, defaults and the auth/validation gates.** These reshape §4.5a, §4.8, §4.9, §4.10 and §4.13 at once.

1. **`unauthorizedHandler` default.** *Proposed:* "Not registering it is a supported configuration. Enforcement is then the operation handler's job via `c.security.authorized`. Reports of handler execution with `authorized === false` and no `unauthorizedHandler` are by design." (Evidence: GHSA-7mmm-8m7g-cp5g closed without patch; branch `docs/clarify-authorization-enforcement`.) Alternative: the default is a gap to close (fail-closed default or an init-time warning), and the disposition becomes `VALID` / `VALID-HARDENING`. → §4.5a, §4.9, §4.10, back-map.
2. **`validationFail` default.** *Proposed:* same ruling as Q1, by symmetry. → §4.5a, §4.9, §4.10.
3. **`strict: false` default.** *Proposed:* "Non-strict is the supported production posture. Swallowing init errors is intentional." → §4.5a.
4. **Coercion gap.** *Proposed:* "With `coerceTypes: false`, values validate as their schema type but arrive as strings. Intended, and documented by the `coerceTypes` option." → §4.5a, §4.9 false friend 3.
5. **Severity of a validation gate bypass (P4).** *Proposed:* "A request the schema rejects reaching the operation handler while `validationFail` is registered is security-relevant and goes through the advisory process." → P4.
6. **Parse-stage rejection (P6).** *Proposed:* "`handleRequest` should resolve (with `validation.valid === false`) rather than reject for any well-typed `Request`. A client-triggerable throw before validation is an availability bug, handled like GHSA-4v89-4c72-fxv7. The `JSON.parse` of `content: application/json` query params in `parseRequest` is the same class." Alternative: "Catching rejections is the caller's job (#88). Parse-stage throws are not vulnerabilities." → P6, §4.11a last row, back-map.
7. **Resource line (P8).** *Proposed:* "No resource guarantee. A hang or process crash on a size-bounded request is a bug. Slow is not." → P8.

**Wave 2: trust boundary and host side effects.**

8. **Definition is fully trusted.** *Proposed:* "The definition, including every external `$ref` and every `pattern`, is operator code. SSRF / file read / ReDoS through it are out of model." → §4.3, §4.7, §4.11a.
9. **Negative side effect inventory (§4.5).** *Proposed:* "No sockets, processes, signals, env reads or global state. Filesystem/network only at `init` for the definition. `console.warn` only at init and registration." → §4.5.
10. **Routing as a security property (P3).** *Proposed:* "Route confusion that changes which operation (and so which `security` list) applies is security-critical." → P3.
11. **Path canonicalisation.** *Proposed:* "The router matches the raw path. Percent-decoding happens only inside matched path params. `..` and `//` aren't normalised. Intended, frameworks canonicalise." → §4.6, §4.9.
12. **Content-type enforcement.** *Proposed:* "Only `application/json` (exact) bodies get validated. Other media types pass through. Issue #229 is an enhancement, not a vulnerability." → §4.9.

**Wave 3: secondary surfaces and meta.**

13. **Concurrent security handlers.** *Proposed:* "Running every named scheme's handler concurrently, regardless of requirement grouping, is intended. Handlers must tolerate side effects." → §4.9.
14. **Mock data disclosure.** *Proposed:* "Examples get published verbatim by `mockResponseForOperation`. Mocking in production is misuse, not a library issue." → §4.9 false friend 6, §4.11.
15. **`mockResponseForOperation` / `validateRequest(…, operationIdString)` arguments are trusted.** *Proposed:* yes. → §4.6.
16. **Shared definition objects via `context.operation`.** *Proposed:* "Handlers mutating `c.operation` is misuse. The library won't deep-freeze or clone per request." → §4.5, §4.10.
17. **Edge probe of a documented claim (P1).** A scheme name listed in `security` but missing from `components.securitySchemes`: with `quick: true` the document validator doesn't catch this. Is the resulting always-failed requirement how it should look like? → P1, §4.5a.
18. **Meta: coexistence.** `SECURITY.md` is disclosure process only and embeds no threat model, so there's nothing to merge. *Proposed:* `SECURITY.md` gets one line linking here as the scope reference. The unmerged `docs/clarify-authorization-enforcement` README paragraph gets merged and cross-links §4.9. → header.
19. **Meta: ownership and revision.** *Proposed:* the maintainer owns this file. It gets updated in the same PR as any change listed in §4.12. The draft confidence line gets updated as questions close.

Note to self: answer wave 1 before anything else. Everything downstream depends on it. 🙏

---

### Appendix: provenance count

Documented: 37 · Maintainer: 0 · Inferred: 31. Every inferred claim maps to Q1 to Q17. Q18 and Q19 are meta questions with no body claim behind them.
