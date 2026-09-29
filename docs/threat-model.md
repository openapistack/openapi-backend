# openapi-backend Threat Model

| | |
| --- | --- |
| **Project** | `openapi-backend` (npm), https://github.com/openapistack/openapi-backend |
| **Version / commit** | 5.21.2 (`796f75c`) |
| **Date** | 2026-09-29 |
| **Status** | **Accepted by the maintainer, 2026-09-16. Revised 2026-09-29** for the 5.21.2 advisories and a new release-integrity section (§14). What changed is in §15. Six questions are open in §13. Two of them (Q5, Q7) could change a triage outcome. |
| **Version binding** | This model is versioned with the code. It lives in the repository, not in the npm tarball. A report against version N gets triaged against `docs/threat-model.md` at tag N, not at `main`. |
| **Reporting** | Breaks a §7 or §14 property? Report it privately per [SECURITY.md](../SECURITY.md). Lands in §2 or §8? It gets closed citing this document. |
| **Provenance legend** | *(documented)* = stated in the project's own artifacts (README, docs site, code comments, tests, commit messages, advisories, maintainer comments on issues). *(maintainer, 2026-09)* = ruled by the maintainer while reviewing this document. *(tested, 5.21.2)* = confirmed by running the code of that release. *(inferred)* = my reading of the code, not confirmed, has a matching question in §13. |
| **Confidence** | 34 documented / 38 maintainer / 24 tested / 1 inferred |

## What is this document?

The unwritten contract between openapi-backend and whoever drops it into their API.

openapi-backend takes an OpenAPI 3.0/3.1 document and, for every request your framework (Express, Fastify, Koa, Hapi, Lambda, Azure Functions) hands it, does four things: routes the request to the operation the document declares, runs your security handlers and combines the results, validates the request against the JSON Schemas with Ajv, and calls your operation handler. It can also validate responses and mock responses from examples or schemas.

It does not open sockets, parse HTTP or write responses. Your framework does that.

Three readers: the integrator who wants to know which threats are theirs now (§8, §9), the triager who needs to close a report by citing a section instead of arguing (§7, §10a, §12), and anyone deciding whether to trust what `npm install` gives them (§14).

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
| **Maintainer and release pipeline** | trusted, and verifiable (§14) | the code in the npm tarball |

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
| **H. Test fixtures, SBOM, scripts** | | | **Out** as runtime code (§2). The CI jobs that run them are family I. |
| **I. Release pipeline** | GitHub repository, Actions workflows, npm trusted publishing | **Yes.** Publishes to npm | **In** since 2026-09 (§14) *(maintainer, 2026-09)* |

## 2. What is out of scope?

- **Authentication and authorisation decisions.** The library never looks at a credential. It calls your security handlers and combines their results per the OpenAPI security requirement semantics. Whether a token is valid is your handler's problem *(documented: README "Auth / Security Handlers"; issue #31 design plan)*.
- **Transport, TLS, HTTP parsing, request size limits, timeouts, rate limiting, compression.** Framework or platform *(maintainer, 2026-09)*.
- **Error handling for thrown errors.** "I've designed the library to be agnostic towards error handling. You can perform exception handling either within the operation handlers or simply catch from `handleRequest`" *(documented: maintainer, issue #88; again in #110)*.
- **Hostile OpenAPI definitions.** The definition is your config. Anything that needs an attacker to author or edit the definition, `apiRoot`, `ajvOpts`, `customizeAjv` or any handler is out of model (§6). That includes SSRF / local file read through external `$ref`s, ReDoS through schema `pattern`s and schemas that make Ajv compile slowly *(maintainer, 2026-09)*.
- **Your framework's body/query parser.** Prototype pollution, depth and size behaviour of the objects it hands over as `req.body` / `req.query` *(maintainer, 2026-09)*.
- **Response body confidentiality.** Response validation is a dev aid, not a data leak control. I don't use runtime response validation in production myself *(documented: maintainer, issue #384)*.
- **Shipped but unsupported code.** The `examples` branch is "separate from the library source on `main`" *(documented: examples branch README)*. Example servers, their dependencies and their auth setups are modelled by whoever copies them. Test fixtures, the SBOM and `scripts/` are not runtime code.
- **Dependency advisories that never reach client data, and SBOM accuracy.** The release pipeline itself is in scope (§14), and §14 lists which dependencies ever see client data. An advisory in one that doesn't, or in a devDependency, is not a vulnerability in this library. An inaccurate SBOM is a bug, not a vulnerability *(maintainer, 2026-09)*.

## 3. Where is the trust boundary?

**At runtime: the `Request` object. That's it.** Everything the client controls comes in through the five fields of `Request` (`method`, `path`, `headers`, `query`, `body`) passed to `handleRequest`, `matchOperation` or `validateRequest`. Everything else the library reads (definition, options, handlers, `handlerArgs`) is on the trusted side *(maintainer, 2026-09)*. The second boundary, between this repository and your `node_modules`, is §14.

**How a request flows** (`handleRequest` in `backend.ts`):

1. `Request` (untrusted) → `router.parseRequest` → `context.request`. Still untrusted, just tidier: lower-cased headers, parsed cookies, parsed query, JSON-parsed string body.
2. `preRoutingHandler` (your code, sees untrusted data).
3. `router.matchOperation`: untrusted `method` + `path` vs trusted path templates → `context.operation` (trusted) or 404/405.
4. `parseRequest` again with the operation. Path params get percent-decoded by `bath-es5` *after* matching. Query params get per-parameter decoding.
5. Security handlers (your code) run **concurrently for every scheme named in any requirement object**. They get the untrusted `context`, return results → `context.security.authorized` (computed by the library, see the P1 table in §7).
6. `postSecurityHandler` (your code), then the gate. `authorized === false` with requirements present: `unauthorizedHandler` if registered → **early return**. No handler and `strict: true` → **reject with `401-unauthorized`**. No handler and `strict: false` → warn once, fall through (§4a, §8). The gate uses the verdict the library computed, so a hook that changes `context.security.authorized` doesn't open it *(tested, 5.21.2)*.
7. Validation → `context.validation`. Errors: `validationFail` (or `400`) if registered → **early return**. No handler and `strict: true` → **reject with `400-validationFail`**. No handler and `strict: false` → warn once, fall through *(documented: code comments in `backend.ts`; tests "without unauthorizedHandler" and "without validationFail handler")*.
8. `preOperationHandler`, the operation handler or `notImplemented`, `postResponseHandler`. Return values are opaque to the library.

The library never turns untrusted data into trusted data. `context.security.authorized` and `context.validation.valid` are the only verdicts the library computes. **In non-strict mode both are advisory unless the matching handler is registered. In strict mode they are enforced.** *(maintainer, 2026-09)*

**Reachability test per family.** First thing a triager checks:

| Family | A finding matters only if… |
| --- | --- |
| A (loading) | it's reachable with an operator-authored definition and options. Needs a malicious definition? `OUT-OF-MODEL: trusted-input`. Note: an un-initialised instance auto-inits on the first `handleRequest` *(documented: code comment)*, so a client can control *when* files/URLs get read, but never *which*. If `init` rejects (strict mode, say, with a definition URL that's down), the instance stays un-initialised and every request tries again: one definition load per client request *(tested, 5.21.2)*. Call `init()` before serving (§9 item 13). |
| B, C, D | it's reachable from the five `Request` fields with any well-formed definition and default options, **or** with a non-default option that isn't dev-only per §4a. |
| E | it's reachable from an operator-supplied response object. Client data only gets here if your handler copies it into the response. |
| F | it's reachable from `operationId` / `opts` values you sourced from the client. Default usage (`c.operation.operationId`) is trusted. |
| I (release) | it lets someone other than the maintainer change what npm serves, or breaks R1 to R3 (§14). |

## 4. What does the library assume about its host?

- **Runtime:** Node ≥ 20 *(documented: `package.json`)*. No native code. No browser support claimed.
- **Concurrency:** one `OpenAPIBackend` instance is shared across all concurrent requests. Per-request state lives in the `context` object only. Mutable instance state touched at request time: the lazy validator cache (`requestValidators` etc.) in `quick` / lazy mode, and the once-only warning set. Two concurrent first requests may compile the same validator twice. Harmless *(maintainer, 2026-09)*. Handler maps are copied at construction so your objects don't get mutated *(documented: code comment and test "copies objects passed to constructor")*.
- **Clock:** not used *(maintainer, 2026-09)*.
- **Filesystem / network:** family A only (§1), only for the definition path and the external `$ref`s it names *(maintainer, 2026-09)*.
- **What it does NOT do to your process** *(maintainer, 2026-09)*:
  - never opens listening sockets, spawns processes, installs signal handlers, reads env vars or touches global state (except binding three `$RefParser` methods at module load);
  - never touches filesystem or network at request time (except the auto-init case above);
  - writes to `console.warn` at init (non-strict mode swallows init errors this way), when you register a handler for an unknown operationId/scheme in non-strict mode, and once per instance when a non-strict request falls through a missing `unauthorizedHandler` or `validationFail`. Never writes to stdout;
  - doesn't mutate the `Request` you pass in (it spreads and clones), with default `ajvOpts` (P5). But it **does** hand out the live dereferenced definition objects via `context.operation`. A handler that mutates `c.operation` mutates the shared definition. That's misuse, not a library bug. The library won't deep-freeze or clone per request.

### 4a. Which options change the security envelope?

No compile-time flags. Runtime knobs that matter:

| Knob | Default | What changes | Ruling |
| --- | --- | --- | --- |
| `strict` | `false` | **Strict is "fail closed".** `true`: init throws on definition errors, `register` throws on unknown names, and `handleRequest` rejects with `401-unauthorized` / `400-validationFail` when a request fails security requirements / validation and no `unauthorizedHandler` / `validationFail` handler is registered. `false`: all of those warn instead and the request continues *(documented: JSDoc, code, tests)*. Those rejections are the signal: catch them, or strict mode fails closed by taking the process down (§9 item 4). | **Default stays `false`.** Lenient by default is the library's character, strict is the production posture *(maintainer, 2026-09)*. **Planned for 6.0:** the fall-through goes away regardless of `strict`. Unregistered `unauthorizedHandler` / `validationFail` will reject unconditionally *(maintainer, 2026-09)*. How 6.0 fails closed is §13 Q6. |
| `unauthorizedHandler` registered | **no** | Not registered: see `strict`. Registered: a request that fails its requirements never reaches the operation handler *(documented: tests)*. | Non-strict fall-through is **by design in 5.x, hardened with a once-only warning**. Register it, or check `c.security.authorized` in every protected handler, or set `strict: true` *(maintainer, 2026-09)*. |
| `validationFail` (or `400`) registered | **no** | Not registered: see `strict`. Registered: a request the schema rejects never reaches the operation handler *(documented: tests)*. | Same ruling as `unauthorizedHandler` *(maintainer, 2026-09)*. |
| `validate` | `true` | `false` disables validation and skips compiling validators. A predicate can skip validation (and so coercion) per request *(documented: README, docs site)*. | Supported production choice ("skip validation for internal traffic"). A predicate keyed on client data is misuse (§10). |
| `quick` | `false` | Skips `validateDefinition`, uses a sync dereferencer, compiles validators lazily at first request *(documented: JSDoc, "attempts to optimise startup; might break things")*. Recommended for serverless *(documented: docs site)*. | Supported. A `quick` deployment is in model. |
| `coerceTypes` | `false` | `true`: Ajv-coerced path/query values replace `context.request.params/query`. `false`: validation still runs Ajv with `coerceTypes: true` on the params schema, so `"1"` validates as `integer` but your handler gets the string. | **Intended.** Lenient matching, raw delivery. Documented as §8 false friend 3 *(maintainer, 2026-09)*. |
| `ajvOpts` / `customizeAjv` | `{ strict: false }` / none | You can weaken or strengthen everything Ajv does (`removeAdditional`, `useDefaults`, formats, `unicodeRegExp`, custom keywords). Trusted. Two sharp ones: `$data: true` lets a schema take keyword values, `pattern` included, from the request itself, which makes client data a `RegExp` source (see Ajv's GHSA-2g4f-4pwh-qvx6). `allErrors: true` keeps Ajv checking after the first failure, so a `maxLength` no longer shields a slow `pattern` (Ajv security notes). | Out of model when non-default and weakening (§6). |
| `ignoreTrailingSlashes` | `true` | `/pets/`, `/pets///` and `/pets` route the same *(tested, 5.21.2)*. | Documented default. |
| `apiRoot` | `/` | Operator string. Matched as a plain string prefix at a path-segment boundary, not as a `RegExp` (since 5.21.2): `/apiadmin` is not under `/api` *(tested, 5.21.2)*. Trusted. | |

**So what's the insecure default story?** In 5.x: not registering `unauthorizedHandler` or `validationFail` is a supported non-strict configuration, you get warned once, and `strict: true` is one line away. In 6.0 the choice goes away and the library fails closed. That's the migration path, and it's the ruling on GHSA-7mmm-8m7g-cp5g (§12).

## 5. What inputs does the library accept, and from whom?

**`handleRequest(req, ...handlerArgs)`** (same for `matchOperation`, `validateRequest`):

| Field | Attacker controls it? | What the library does with it | You must enforce |
| --- | --- | --- | --- |
| `req.method` | **yes** | trims, lower-cases; only `get put post delete options head patch trace` can match | nothing |
| `req.path` | **yes** | trims, prefixes `/`, drops everything from the first `?`, strips `apiRoot` at a segment boundary, strips trailing `/`s. **Case-sensitive. No percent-decoding, no `..` or `//` normalisation before matching**, and a leading `//` is not collapsed (since 5.21.2). Path params get percent-decoded *after* the segment matched `[^/]+`, so `a%2Fb` is one segment that decodes to `a/b`, and `%2e%2e` decodes to `..` *(maintainer, 2026-09; tested, 5.21.2)* | canonicalisation if your app cares about `..`, `//`, case or encoded slashes. Frameworks normally give a decoded or raw path consistently |
| `req.headers` | **yes** | keys lower-cased; `cookie` parsed with `cookie.parse`; the media type of `content-type` (parameters such as `charset` ignored) decides whether a non-object body gets validated as JSON | header size limits (framework) |
| `req.query` (object) | **yes** | deep-cloned as is. **Nested objects and arrays are whatever your framework produced** | framework query parser limits |
| `req.query` (string) or `?…` in path | **yes** | parsed by `qs` with defaults (`depth 5`, `parameterLimit 1000`, `arrayLimit 20`, prototype keys dropped) *(maintainer, 2026-09; tested, 5.21.2)* | nothing beyond framework limits |
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
| `mockResponseForOperation` | `operationId`, `opts.code/mediaType/example` | **no, trusted by contract.** The lookups are plain property reads on the definition (`responses[opts.code]`, `examples[opts.example]`) with no prototype key guard. Forward `__proto__` or `constructor` anyway and you get the default mock or the first example: no throw, no leak *(tested, 5.21.2)* | see §10 |
| `validateRequest(req, operation)` | `operation` (string/object) | no | `req` is untrusted as above |
| `validateResponse*` | `res`, `headers`, `operation`, `statusCode` | no | |

**Size, shape, rate:** nothing enforced. Validation cost is whatever Ajv does with your schema against a body your framework already bounded (§8 lists the expensive keywords). Routing is O(number of operations) per request with a fresh `RegExp` per template *(maintainer, 2026-09)*.

## 6. Who is the attacker?

**In scope: the unauthenticated network client.** It can:

- put any bytes in `method`, `path`, `headers`, `query` and `body`, within your framework's limits, control characters (CR, LF, NUL) included;
- repeat keys and headers, and use prototype-named keys (`__proto__`, `constructor`, `prototype`);
- use syntax the parsers understand: `qs` brackets, `style` / `explode` delimiters, JSON in `content: application/json` query params and in bodies;
- send as many requests as it likes, including the first one after a cold start (§3, family A).

What it wants: reach an operation handler without satisfying its security requirements, reach a handler with data the schema should have rejected, get routed to a different operation than the path/method says, make `handleRequest` throw or hang, pull definition content it shouldn't see *(maintainer, 2026-09)*. **A report that needs a capability not listed here isn't in model.**

**In scope, weaker: the client of a `notImplemented`-mocked API.** Same capabilities. Goal: extract example data (§8).

**In scope since 2026-09: the supply-chain attacker** (§14). Wants its code in the tarball you install, through the maintainer's accounts, the release workflow, a GitHub Action or a dependency *(maintainer, 2026-09)*.

**Out of scope** *(maintainer, 2026-09)*:

- Anyone who can author or alter the definition, options or handler code. That's the operator.
- In-process code (other modules, the framework). Already won.
- Side channel and timing observers. The library compares no secrets.
- Co-tenants, container escapes, OS-level attackers.
- Anyone who can make `init` load a definition from a path or URL they control. That's operator misconfiguration (§10).
- Anyone who controls the dependency versions *you* resolve: your lockfile, your registry mirror. §14 says what happens upstream.

## 7. What does the library guarantee?

Only properties the project has actually committed to. No inventing. Release properties R1 to R3 are in §14.

| # | Property (and when it holds) | What a break looks like | Severity | Provenance |
| --- | --- | --- | --- | --- |
| **P1** | **Security requirement semantics.** For a matched operation, `context.security.authorized` is `true` iff at least one Security Requirement Object in the operation's (or, failing that, the document's) `security` list has *every* named scheme passing, per the table below. An empty requirement object `{}` has nothing to fail, so it passes: anonymous access, as the spec intends. Scheme with no registered handler → *failed*. Handler threw or rejected, with any reason → *failed*. Results are per request, and `authorized` is written last, so no scheme or handler result named `authorized` can overwrite it. | `authorized === true` when a required scheme's handler returned falsy, returned `{ error: <truthy>, … }`, threw, rejected or was unregistered. Or `authorized === false` when the spec's OR/AND says it should pass. | **Security-critical.** Fail-open = advisory. GHSA-j939-289f-wq4w (5.18.0) and GHSA-fwvf-w25j-mj87 (5.21.2) were both High. | *(documented: docs site "Auth with Security Handlers"; commits `834158d`, `5ae65a2`; tests)* |
| **P2** | **Enforcement gate.** With `unauthorizedHandler` registered, or with `strict: true`, a request with `authorized === false` and a non-empty requirement list never reaches validation, `preOperationHandler` or the operation handler. The gate reads the verdict the library computed, not `context.security.authorized`, so hooks can't open it. `postSecurityHandler` runs before the gate and does see unauthorised requests. | Operation handler runs despite `authorized === false` under either condition. | **Security-critical** | *(documented: tests "does not call operation handler if requirements are not met and unauthorizedHandler is defined", "rejects with 401 in strict mode if requirements are not met"; tested, 5.21.2)* |
| **P3** | **Routing fidelity.** A request goes to the operation whose path template and method it matches under the normalisation in §5: an exact path with that method first, then the most specific matching template (most literal characters) that has the method, ties in definition order. So a method a specific path doesn't declare can land on a less specific template that does: with `/pets/{id}` (GET) and `/{a}/{b}` (DELETE), `DELETE /pets/1` goes to `/{a}/{b}`, under its `security` list. No template matches → 404 handling. Path matches, method doesn't → 405 handling. **The router adds no aliases of its own.** Two paths reach the same operation only through the §5 normalisation: literal template characters match only themselves, and `apiRoot` is stripped only at a segment boundary. Path param values are exactly the matched segment, percent-decoded. | A request reaching an operation its template doesn't match (route confusion). An alias the §5 normalisation doesn't produce: GHSA-m748-x4gc-4w5w routed `//pets` as `/pets` and `/apiadmin` as `/api/admin`. Path params with bytes from outside the matched segment. | **Security-critical** when it changes which handler (and so which `security` list) applies, or lets a request dodge a path-based rule in front of the library (a proxy or WAF that sees a different path). GHSA-m748-x4gc-4w5w was Medium. Correctness-only otherwise. | *(maintainer, 2026-09; tests cover matching, specificity and the 5.21.2 aliases; tested, 5.21.2)* |
| **P4** | **Validation gate.** With `validationFail` (or `400`) registered, or with `strict: true`, and `validate` on for the request: a request doesn't reach the operation handler if its path/query/header/cookie parameters or its JSON body (media type `application/json`, parameters ignored, or an object body from the framework) fail the operation's schema, or if a `content: application/json` query param isn't valid JSON. Unknown query and path params are rejected (`additionalProperties: false`), unless a query parameter's own schema sets `additionalProperties` (free-form object params), which then applies to the whole query object. Repeated query keys arrive as arrays and fail a scalar schema *(tested, 5.21.2)*. Unknown headers and cookies are allowed. `required` params are enforced for all four locations. | Operation handler called for input the schema rejects, under the stated conditions. | **Security-critical** when the bypass is reachable from `Request` fields. Goes through the advisory process, not the issue tracker. Correctness-only for over-rejection. | *(documented: README "Request validation"; tests)* for the mechanism; *(maintainer, 2026-09)* for the tier |
| **P5** | **No mutation of your objects.** Constructor `handlers` / `securityHandlers` maps and the `Request` object are not mutated, with default `ajvOpts`. Ajv options that rewrite data (`useDefaults`, `removeAdditional`) rewrite a framework-parsed body in place *(tested, 5.21.2)*. | Your object changed after a call. | Correctness-only | *(documented: code comments, test "copies objects passed to constructor")* |
| **P6** | **Error contract.** For any well-typed `Request`, `handleRequest` either resolves or rejects with an `Error` that the library or your handlers threw on purpose. Rejection is the *documented* outcome for: unmatched route with no `notFound` handler, no handler for the operation and no `notImplemented`, `strict: true` with a failed security requirement or validation and no handler (§4a), and any throw from your handlers *(documented: code; maintainer #88, "simply catch from `handleRequest`")*. **Malformed client input never rejects before validation.** It becomes a validation error. GHSA-4v89-4c72-fxv7 (`TypeError` on `?limit[a]=1` with `explode: false`) was this class, fixed in 5.17.0. The sibling case, malformed JSON in a `content: application/json` query param, is fixed in 5.21.0. | Unhandled rejection or process exit on a crafted request, or a rejection whose stack points at the parser rather than a handler. | **Availability, request-scoped. `VALID`.** | *(maintainer, 2026-09; documented: tests "leaves malformed json … instead of throwing", "fails validation with a parse error")* |
| **P7** | **No code evaluation of client data.** Client bytes only ever get `JSON.parse`d, string-split, regex-matched against operator templates and schema-validated. Never `eval`ed, never used to build a `RegExp`, never used as a file path or URL. Holds for default `ajvOpts`; `$data: true` is the exception you opt into (§4a). | Any of those. | **Security-critical** | *(maintainer, 2026-09)* |
| **P8** | **Resource use.** A hang or a process crash on a size-bounded request is a bug. So is CPU or memory in the library's own code that grows super-linearly with request size, or any sharp asymmetry where one cheap request costs the process far more than it cost the client. Constant-factor slowness is not. Neither is the cost your schema asks Ajv to pay (§8). Body size limits stay with the framework. | Hang, crash or super-linear growth on a bounded request. | **Availability. `VALID` on the stated line.** | *(maintainer, 2026-09)* |

**P1 in detail: when does a scheme pass?**

| The scheme's handler… | Result |
| --- | --- |
| returns a truthy non-object (`true`, `'ok'`, `1`) | pass |
| returns an object without a truthy `error` (`{ user }`, `{ error: null, user }`) | pass |
| returns an `Error` instead of throwing it | **pass.** An `Error` is a truthy object with no `error` property (false friend 8, §13 Q5) *(tested, 5.21.2)* |
| returns a falsy value (`false`, `null`, `undefined`, `0`, `''`) | fail |
| returns an object with a truthy `error` | fail |
| throws or rejects, whatever the reason (`throw null` too, since 5.21.2) | fail |
| isn't registered | fail |
| never settles | the request hangs. Your handler, your timeout (§8) |

`context.security[scheme]` keeps the raw result (`{ error }` for a throw, `undefined` when unregistered). Nothing but `authorized` is computed by the library (false friend 7).

## 8. What does the library NOT do?

The most useful section for an integrator. Read this one twice.

- **No authentication or authorisation.** Security handlers are your code. Declaring `securitySchemes` and `security` in the definition blocks nothing on its own *(documented: docs site; README)*.
- **No enforcement of `authorized === false` in non-strict mode without `unauthorizedHandler`.** The operation handler runs (after a once-only warning) and has to check `c.security.authorized` itself. Strict mode rejects. 6.0 will reject regardless *(maintainer, 2026-09)*.
- **No enforcement of validation errors in non-strict mode without `validationFail`.** Same shape *(maintainer, 2026-09)*.
- **No content-type enforcement.** Only a JSON body (media type `application/json`, parameters like `charset` ignored, or an object body from the framework) is schema-validated. A body sent as text, XML or multipart goes to your handler unvalidated. Media types the operation doesn't declare are not rejected either *(maintainer, 2026-09; issue #229 stays an enhancement)*. One wrinkle: a string body is `JSON.parse`d whatever its content type. If that gives an object, an array or `null`, it gets validated like JSON. A JSON scalar sent as `text/plain` (say `123`) reaches your handler parsed but unvalidated, unless the body is `required` *(tested, 5.21.2)*.
- **No request size, depth, count or rate limits. No timeouts.** (§7 P8)
- **No limit on what your schema costs.** `pattern` and `format` regexes, `patternProperties`, and `uniqueItems` on arrays of objects run on client data at whatever cost the schema implies. `uniqueItems` is quadratic: an 8,000-item array (93 KiB) takes about half a second to validate on a laptop *(tested, Ajv 8)*. Put `maxLength` / `maxItems` next to them, and read [Ajv's security notes](https://ajv.js.org/security.html).
- **No path canonicalisation** (§5). `/a/../b`, `/a//b` and `/%61` are three different paths to this router, whatever your proxy thinks *(maintainer, 2026-09)*.
- **No isolation between security handlers.** All handlers named anywhere in the requirement list run concurrently for every request, even for requirement objects that won't be needed. A handler with side effects (rate limit counters, audit logs, token introspection calls) runs regardless of the outcome. Intended. Handlers must tolerate it *(maintainer, 2026-09)*.
- **No constant-time comparison, hashing, signing or randomness.** Zero crypto in the library. Whatever a handler compares, handler code compares *(maintainer, 2026-09)*.
- **No protection of the definition from its own consumers.** `context.operation` and `api.definition` are the live dereferenced objects *(maintainer, 2026-09)*.
- **No runtime response validation by default.** When you opt in it's a schema check, not a filter: it doesn't strip unexpected fields, `validateResponse` without a `statusCode` accepts a body matching *any* declared response's schema, and a body for an undeclared status isn't checked at all *(documented: README; issue #384 open, maintainer: "don't really see any need for runtime response validation")*.

**False friends.** Things that look like a control but aren't:

1. **`security:` in the definition ≈ auth enforcement.** It's a *list of handler names to consult*. Enforcement needs a registered handler for each scheme *and* one of: `unauthorizedHandler`, `strict: true`, or a check inside every operation handler. "Bypass" reports that boil down to this config are the single most common report shape against this project (GHSA-7mmm-8m7g-cp5g) *(documented)*.
2. **`validate: true` (default) ≈ invalid requests get rejected.** It means *validation gets computed*. Rejection needs `validationFail` or `strict: true` *(documented: code comment)*.
3. **A passing schema ≈ correctly typed values in your handler.** With `coerceTypes: false` (default) an `integer` query param that validated still arrives as a string. And Ajv's idea of an integer is generous: `"0x10"`, `"1e3"`, `"0b11"` and `" 7"` all pass *(tested, 5.21.2)*. `Number()` reads them as 16, 1000, 3 and 7, `parseInt()` as 0, 1, 0 and 7. Handlers that branch on `typeof` or do arithmetic get JavaScript coercion, not schema coercion *(maintainer, 2026-09)*. Fastify fixed the same shape in its own code as a vulnerability (CVE-2026-18504). Here it's documented behaviour; whether it stays that way is §13 Q7.
4. **`quick: true` ≈ same guarantees, faster.** It skips OpenAPI document validation. A definition that normal mode would reject gets served as is *(documented: JSDoc "might break things")*.
5. **`strict: false` (default) ≈ lenient about handler names only.** It also swallows *definition load failures* (a typo in the file path gives you a warning and an instance that 404s everything) and it's what makes the missing-handler fall-through possible *(documented: code)*.
6. **`mockResponseForOperation` ≈ safe placeholder data.** It returns the definition's `example` / `examples` values *verbatim* (whatever the author put there, realistic-looking credentials and PII included) or `mock-json-schema` output. A `notImplemented` handler that mocks in production publishes those examples to every client. Misuse, not a library issue *(maintainer, 2026-09)*.
7. **`context.security[schemeName]` ≈ a verified identity.** It's whatever the handler returned, `{ error }` objects and `undefined` for unregistered schemes included. Only `context.security.authorized` is computed by the library *(documented: docs site)*. Even that only says "a requirement object passed": it's `false` on operations with no requirements at all, and `true` whenever the list contains `{}` *(tested, 5.21.2)*.
8. **Returning an `Error` from a security handler ≈ failed auth.** It passes (P1 table). Throw it, or return `false` or `{ error }` *(tested, 5.21.2)*.
9. **`strict: true` ≈ safe on its own.** Strict mode fails closed by *rejecting*. Behind a framework that doesn't catch rejections (Express 4, a bare `http` server), every unauthorised or invalid request then takes the process down, because Node ≥ 15 exits on unhandled rejections *(tested, 5.21.2)*. Catch it (§9 item 4).

**Attack classes every OpenAPI router/validator leaves to you:**

- *HTTP parameter pollution.* Repeated query keys become arrays, and fail a scalar schema when validation is enforced. A single value for an `array` param is wrapped for validation only: your handler gets the plain string unless `coerceTypes` is on *(tested, 5.21.2)*. Handle `string | string[]`.
- *JSON Schema type confusion* (`"1"` vs `1`, `"true"` vs `true`, `"0x10"` vs `16`). False friend 3.
- *Path traversal through path params.* Params are percent-decoded after matching: `%2F` becomes `/`, `%2e%2e` becomes `..`, `%00` becomes NUL. Never use them as file paths or URLs unchecked.
- *Parser differentials.* Your proxy, your framework and this library can disagree about a path, a query string or a media type. P3 promises the router adds no aliases of its own. Making the layers agree is yours (§9 item 6).
- *Prototype pollution through body/query objects.* Whatever your framework parser allows reaches the handler. The library's own `qs` usage drops prototype keys, but `req.query` / `req.body` objects are taken as given.
- *Oversized bodies, slow-loris, deeply nested JSON.* Framework / platform layer.
- *ReDoS via schema `pattern`, and other expensive keywords.* Definition is trusted. Copy a third-party definition and you inherit its regexes and its `uniqueItems`.
- *SSRF / local file read via `$ref`.* Definition is trusted. Load it from an untrusted path or URL and you crossed the boundary yourself.
- *Example data leaking through mocks.* False friend 6.

## 9. What do you need to do?

The contract from your side:

1. **Register `unauthorizedHandler`** whenever the definition declares any `security` requirement. Or set `strict: true`. Or check `c.security.authorized` at the top of every protected handler. Pick one. The warning tells you if you picked none.
2. **Register `validationFail`** (or `400`) if you rely on the schema to bound handler input. Or `strict: true`. Same deal.
3. **Register a security handler for every scheme in `components.securitySchemes`.** An unregistered scheme fails closed, but silently. `strict: true` turns unknown *handler names* into errors, not missing handlers.
4. **Wrap `handleRequest` in `try/catch`** (or `.catch`) and map rejections to an error response *(documented: #88)*. In strict mode that's where your 401 and 400 responses come from, so an uncaught rejection is a crash, not a 401 (false friend 9). With Express 4: `app.use((req, res, next) => api.handleRequest(req, req, res).catch(next))`.
5. **Bound request size, depth and rate at the framework/platform layer.** The library assumes you did.
6. **Canonicalise the path before handing it over** if your routes could be confused by `..`, `//` or percent-encoded slashes. Pass the same form (raw vs decoded) every time.
7. **Treat the definition as code.** Load it from a path or object you control. Audit `pattern`s and external `$ref`s in third-party definitions before use. Never resolve a definition from a client-influenced location.
8. **Don't mock in production.** Or scrub `example` / `examples` first, unless the examples are meant to be public anyways.
9. **Convert path and query values yourself** before arithmetic, comparisons or database lookups: `Number(x)`, then range-check. Validation tells you a value *can* be read as an integer, not that your handler got one (false friend 3).
10. **Don't forward client values into `mockResponseForOperation(opts)` or `validateRequest(req, operationIdString)`** without allow-listing them against the definition.
11. **Keep `validate` on and `quick` off in security-sensitive deployments** unless you understand the trade (quick mode skips document validation).
12. **Don't mutate `c.operation` or `api.definition`** from handlers. They're shared across requests.
13. **`await api.init()` before you serve traffic.** Auto-init works, but it moves definition loading into a client request, and in strict mode every request retries a failed init (§3).
14. **Fail a security handler by throwing, or by returning `false` or `{ error }`.** Never by *returning* an `Error` (false friend 8).
15. **Keep a lockfile and check what you install** (`npm audit signatures`, §14).
16. **Run [openapi-backend-codeql](https://github.com/openapistack/openapi-backend-codeql) in code scanning.** It checks items 1, 2, 3, 7 and 10 and the `validate` predicate misuse in §10.

## 10. How does this library get misused?

Where a [CodeQL query](https://github.com/openapistack/openapi-backend-codeql) finds the pattern, its ID is in brackets.

- Security handler registered, no `unauthorizedHandler`, no `strict`, no `authorized` check in the operation handlers (the GHSA-7mmm-8m7g-cp5g shape). You'll see the warning on the first unauthorised request. Act on it. [`js/openapi-backend/unenforced-security`]
- Relying on schema validation with no `validationFail` handler and no `strict`. Same warning. [`js/openapi-backend/unenforced-validation`]
- A scheme in the definition that no security handler was ever registered for. It fails closed, but auth was probably never wired up. [`js/openapi-backend/missing-security-handler`]
- Returning `{ error: null, user }` from a security handler *is* the documented success pattern. Returning `{ error: '...', user: null }` is failure. Handlers that return arbitrary objects with an `error` key by accident (e.g. an upstream API response) fail closed and nobody knows why *(documented: commit `acf6e8c`)*. Handlers that *return* an `Error` pass (false friend 8).
- Treating path/query values as typed because they passed validation (false friend 3).
- Mocking via `notImplemented` in production.
- Setting `validate` to a predicate keyed on a client-controlled header (the README example uses `x-internal-request`) without the proxy stripping that header from external traffic. The predicate then lets any client skip validation. [`js/openapi-backend/client-controlled-validation`]
- Forwarding client input into `mockResponseForOperation` or `validateRequest(req, operationId)`. [`js/openapi-backend/client-controlled-operation`]
- Loading the definition from a URL or user-writable storage. [`js/openapi-backend/untrusted-definition`]
- Passing a `Request` whose `path` still has the framework mount prefix while `apiRoot` is `/` (or the reverse), getting universal 404s, then "fixing" it by loosening the framework route to `/*` and exposing every operation.
- Setting `strict: true` behind Express 4 or a bare `http` server without catching `handleRequest` (false friend 9).

### 10a. What gets reported that isn't a bug?

Feed this to your scanner as a suppression list.

| Reported as | CWE | Why it's not a bug here |
| --- | --- | --- |
| "`new RegExp` built from a path template" (`router.ts`, and `bath-es5`'s param extraction) | CWE-1333 | Templates are operator-authored (§5 trusted table). Since 5.21.2 the router escapes their literal parts, and `apiRoot` isn't a `RegExp` at all. `OUT-OF-MODEL: trusted-input`. |
| "Ajv `strict: false` by default disables schema strictness" | | Deliberate, to accept OpenAPI-flavoured schemas (`nullable`, `example`, `discriminator`) *(inferred, Q4)*. Override via `ajvOpts` if you want. `KNOWN-NON-FINDING`. |
| "Security scheme `X` has no handler and the request isn't rejected" / "Unauthenticated request reaches operation handler with `context.security.authorized === false`" | CWE-287 | Missing handler = failed scheme (P1). Whether the request gets *rejected* depends on `unauthorizedHandler` / `strict` (§4a). Non-strict, no handler → `BY-DESIGN: property-disclaimed` (§8). Strict or handler registered → `VALID` (P2). |
| "Invalid body reaches operation handler" | CWE-20 | Non-strict, no `validationFail` → `BY-DESIGN` (§8 false friend 2). Otherwise `VALID` (P4). |
| "Body under `text/plain` / `application/xml` / `multipart` isn't validated" | CWE-20 | §8 "no content-type enforcement". `BY-DESIGN`. |
| "Validated value differs from the value the handler receives" (a coercion differential, like Fastify's CVE-2026-18504) | CWE-20 | With `coerceTypes: false` (default), validation coerces and your handler gets the raw string. Documented (§4a, false friend 3). `BY-DESIGN: property-disclaimed` until §13 Q7 says otherwise. |
| "A security handler that returns an `Error` is treated as authorised" | CWE-253 | Truthy results pass (P1 table). `BY-DESIGN: property-disclaimed` until §13 Q5 says otherwise. |
| "`handleRequest` rejects" / "one unauthenticated request crashes my server in strict mode" | CWE-248 | Rejection is the documented error channel (P6), and in strict mode it's how 401 and 400 are signalled. A rejection that comes from your own handler throwing is yours too. Catch it (§9 item 4). `BY-DESIGN: property-disclaimed`. |
| "`JSON.parse` of request body without try/catch" (`validation.ts`) | CWE-248 | It *is* wrapped. The error becomes a `parse` validation error. `KNOWN-NON-FINDING`. |
| "`JSON.parse` of a `content: application/json` query param without try/catch" (`router.ts`) | CWE-248 | Wrapped since 5.21.0. Validation reports a `parse` error. `KNOWN-NON-FINDING`. |
| "External `$ref` resolution reads arbitrary files / does HTTP requests (SSRF)" | CWE-918, CWE-73 | Definition is trusted. Refs are operator-authored. `OUT-OF-MODEL: trusted-input`. |
| "ReDoS in schema `pattern`" / "quadratic `uniqueItems`" | CWE-1333, CWE-407 | Trusted definition, and its cost is the schema's (§8). `OUT-OF-MODEL: trusted-input`. |
| "Prototype pollution via `__proto__` in query string" | CWE-1321 | `qs` defaults drop prototype keys *(tested, 5.21.2)*. `KNOWN-NON-FINDING`. For object `req.query`, your framework's parser owns it: `OUT-OF-MODEL: adversary-not-in-scope` (§2). |
| "`mockResponseForOperation` reads caller-supplied keys without a prototype guard" | CWE-1321 | The arguments are operator-trusted (§5), and prototype names are harmless there anyway *(tested, 5.21.2)*. `OUT-OF-MODEL: trusted-input`. |
| "`console.warn` leaks definition errors" / "`console.warn` on an unauthorised request is a log injection or DoS vector" | CWE-117 | Operator-facing stderr. The messages carry definition errors or the `operationId` from your definition, never client data, and the request-time ones fire once per instance. `KNOWN-NON-FINDING`. |
| "`handleRequest` on an un-initialised instance triggers file reads" | CWE-73 | Documented auto-init. Target is operator-configured (§3 family A). `OUT-OF-MODEL: trusted-input`. |
| "Header/cookie `additionalProperties: true` lets unknown headers through" | CWE-20 | Intentional. HTTP headers are open-ended. `additionalProperties: false` applies to path and query only (P4). `KNOWN-NON-FINDING`. |
| "Advisory in a devDependency / an `examples/*` dependency", or in a runtime dependency that only sees the definition | CWE-1395 | §2 and the §14 dependency table. `OUT-OF-MODEL: unsupported-component`, or `trusted-input` for definition-only dependencies. |

## 11. When does this model need a rewrite?

- A new `Request` field, or the library starting to parse a new encoding (XML, multipart bodies).
- **6.0 removing the non-strict fall-through.** Rewrites §4a, §8 bullets 2 and 3, §9 items 1, 2 and 4, false friends 1, 2, 5 and 9, and the GHSA-7mmm row below.
- The library gaining a network or filesystem surface at request time (remote definition reloads, OIDC discovery in a built-in security handler).
- Reference security handlers shipping in core (planned in issue #31, item 4). They'd become in-model authentication code and the first bullet of §2 stops being true.
- A change in Ajv defaults (`strict`, `coerceTypes` on the params validator) or in `qs` parsing options.
- Anything from the `examples` branch getting promoted into the package.
- A change to how releases get built or published: a new workflow or job that can publish, a second publisher, leaving trusted publishing (§14).
- A new runtime dependency, or an existing one starting to see client data (§14 table).
- **Every advisory.** The fix release updates the header, the §12 log and any property the report sharpened (§13 Q3).
- **Evidence the model is incomplete:** any report that can't be routed to exactly one §12 disposition. Fix by editing §7 or §8, not by ad-hoc triage.

## 12. How do we triage a report?

Closed set. A report that doesn't fit isn't "other", it's `MODEL-GAP`.

| Disposition | Meaning | Licensed by |
| --- | --- | --- |
| `VALID` | Breaks P1 to P8 via the client adversary and an in-model input, or R1 to R3. | §7, §5, §6, §14 |
| `VALID-HARDENING` | No property broken, but a §10 misuse is easy enough that we choose to harden. Private report, maintainer discretion, typically no CVE. | §10 |
| `OUT-OF-MODEL: trusted-input` | Needs control of the definition, options, handlers, `handlerArgs` or `mockResponseForOperation` arguments. | §5 |
| `OUT-OF-MODEL: adversary-not-in-scope` | Needs in-process, side channel, co-tenant or definition-author capability. | §6 |
| `OUT-OF-MODEL: unsupported-component` | Lands in the `examples` branch, test fixtures, `sbom/`, `scripts/`. | §2 |
| `OUT-OF-MODEL: unsupported-version` | Only reproduces on a version older than the latest 5.x release. | [SECURITY.md](../SECURITY.md#supported-versions) |
| `OUT-OF-MODEL: non-default-build` | Only shows up under a weakening `ajvOpts` / `customizeAjv`. | §4a |
| `BY-DESIGN: property-disclaimed` | About a §8 non-property or false friend. Includes the non-strict fall-through in 5.x. | §8 |
| `KNOWN-NON-FINDING` | Matches a §10a row. | §10a |
| `MODEL-GAP` | Doesn't route cleanly. Revise the model. | §11 |

**Show, don't hypothesise.** A report needs something runnable: the definition, the options, the handlers and the request. "An integrator could configure X" is only a finding if X is a well-formed definition, a default, or an option §4a doesn't rule out.

**Does the model survive contact with real reports?** Five so far:

| Report | Disposition | Section | Severity | Fixed in | Credit |
| --- | --- | --- | --- | --- | --- |
| [GHSA-4v89-4c72-fxv7](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-4v89-4c72-fxv7): `TypeError` on `?limit[a]=1` with `explode: false` | `VALID` (availability). Fix: commit `5450967`. The sibling `JSON.parse` case followed in 5.21.0. | P6 | Low | 5.17.0 | kq5y |
| [GHSA-j939-289f-wq4w](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-j939-289f-wq4w): multi-key `{ error, … }` treated as authorised | `VALID` | P1 | High | 5.18.0 | Sengtocxoen |
| [GHSA-7mmm-8m7g-cp5g](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-7mmm-8m7g-cp5g): fail-open without `unauthorizedHandler` | `VALID-HARDENING`. Non-strict fall-through stays by design in 5.x. Hardened in 5.21.0: once-only warning, and `strict: true` rejects. Fail-closed unconditionally in 6.0. | §4a, §8, P2 | Medium | 5.21.0 | EQSTLab |
| [GHSA-m748-x4gc-4w5w](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-m748-x4gc-4w5w): `apiRoot` stripping aliased `//pets` onto `/pets` and `/apiadmin` onto `/api/admin` | `VALID` | P3 | Medium | 5.21.2 | p- |
| [GHSA-fwvf-w25j-mj87](https://github.com/openapistack/openapi-backend/security/advisories/GHSA-fwvf-w25j-mj87): a handler that threw or rejected a falsy reason counted as authorised; a scheme named `authorized` could overwrite the verdict | `VALID`. A regression from the GHSA-j939 fix. | P1 | High | 5.21.2 | p- |

Five out of five route cleanly. 🙏

**What the log says.** Two of five broke P1, and one of those was a regression introduced by the other's fix. A change to security requirement evaluation should be tested against every row of the P1 table, not just the reported case.

## 13. What still needs deciding?

Six open. Q5 and Q7 could change a triage outcome. The others don't.

1. ~~**`mockResponseForOperation` / `validateRequest(…, operationIdString)` arguments are trusted.**~~ **Closed 2026-09-29.** Trusted by contract (§5). Testing showed prototype names are harmless there, which removed the only reason to add guards.
2. **Edge probe of P1.** A scheme name listed in `security` but missing from `components.securitySchemes` isn't caught at `init`, in normal mode or with `quick: true` *(tested, 5.21.2)*. The requirement then always fails: no handler can be registered for it in strict mode, and in non-strict mode it fails silently unless you register one anyway. Is that how it should look like, or should `init` warn? → P1, §4a.
3. **Ownership and revision.** *Proposed:* the maintainer owns this file. It gets updated in the same release as any change listed in §11, including every advisory fix. Each `VALID` fix also gets a regression test named after its advisory and a look for variants of the same bug. The confidence line gets updated as questions close. → header, §11.
4. **Ajv `strict: false` default.** *Proposed:* "Deliberate. OpenAPI schemas carry keywords Ajv strict mode rejects (`nullable`, `example`, `discriminator`, `xml`). Operators who want strict Ajv set it in `ajvOpts`." → §10a.
5. **Security handlers that return an `Error`.** They pass today (P1 table). *Proposed:* treat an `Error` result as a failure, as `VALID-HARDENING`, since nobody returns one to mean "authorised". → P1, false friend 8.
6. **How 6.0 fails closed.** Rejecting per request is what strict mode does now, and a naive Express 4 setup turns that into a crash per request (false friend 9). The alternative is refusing to `init` when the definition has `security` requirements and no `unauthorizedHandler` is registered, and the same for validation. That fails at deploy time instead of at request time. → §4a, §11.
7. **Coercion differential.** Fastify fixed "validate the coerced value, hand the handler the original" as a vulnerability (CVE-2026-18504). Here it's the documented default (false friend 3). *Proposed:* keep the ruling in 5.x and revisit the `coerceTypes` default for 6.0. → §4a, §10a.

Note to self: Q2 becomes interesting once the 6.0 fail-closed change lands. Decide it then, together with Q6.

## 14. How does a release get to you?

The second trust boundary. §3 is about what a client can do to a running instance. This is about what it takes to change the code you install. For an npm library that's the worst case: a malicious release runs inside every consumer at once, no request needed *(maintainer, 2026-09)*.

**The path.**

1. A commit lands on `main`. One maintainer has write access. `main` is protected against force-pushes and deletion.
2. The maintainer pushes a version tag.
3. [`ci.yml`](../.github/workflows/ci.yml) runs the `test` job (the library and 11 example projects), then the `publish` job.
4. `publish` installs with `npm ci --ignore-scripts`, builds with `tsc` (`prepublishOnly`) and publishes through npm trusted publishing (OIDC). npm records a signed provenance attestation.
5. npm serves the tarball. **Your** lockfile decides when you take it, and which dependency versions come with it.

**What the project guarantees.**

| # | Property | Backed by | How to check |
| --- | --- | --- | --- |
| **R1** | **Provenance.** Every release since 5.16.0 was published by `ci.yml`, from a tag, through npm trusted publishing, and has a provenance attestation naming the workflow, the tag, the commit and the run. Provenance can't show which job published; R3 is what keeps that to the `publish` job. | Trusted publishing since 2026-02 (commit `2520b7e`) | `npm audit signatures`, or `gh attestation verify` with the workflow and tag ([SECURITY.md](../SECURITY.md#verifying-a-release)) *(tested: 5.16.0 to 5.21.2)* |
| **R2** | **Reproducible build.** A release tarball is byte-identical to `npm ci --ignore-scripts && npm run build && npm pack` at its tag: same sha512 as `dist.integrity`. | Lockfile-pinned `tsc`, `npm pack`'s fixed timestamps, no network at build time | Rebuild and compare against `npm view openapi-backend@<version> dist.integrity` *(tested, 5.21.2)* |
| **R3** | **Least privilege in CI.** No job but `publish` can request an OIDC token. `publish` installs without dependency install scripts, restores no cache, and runs one third-party tool while the token is available: `tsc`, pinned by the lockfile. Everything else that runs third-party code (tests, the example projects, SBOM tooling) holds no write token and can't publish. The one job that can write to the repository (the SBOM commit) runs no third-party code: only `git` and GitHub's own checkout and artifact actions. Every action is pinned to a commit SHA. | `ci.yml`, `sbom.yml`, `codeql.yml` | Read the workflows |

A break of R1 to R3 is `VALID` (§12). For example: a path from a pull request or a dependency to a publish or a push to `main`, a release without provenance, or a tarball that doesn't match its tag. Report it privately. Please don't demonstrate CI attacks by opening pull requests against this repository.

One known quirk, so nobody raises a false alarm: the provenance of 5.21.1 names commit `3849264`, which isn't on `main`. It's the version commit as tagged, before it was amended to drop a `Co-authored-by` trailer and pushed as `d9a29ea`. Same parent, identical tree: `git diff 3849264 d9a29ea` is empty.

**Threats, and what stands in their way.**

| Threat | What it looks like | What stops it here | What's left |
| --- | --- | --- | --- |
| Maintainer account takeover | A phished npm or GitHub login (the chalk/debug compromise, September 2025) | Nothing in this repository: it comes down to the maintainer's GitHub and npm accounts. | **The biggest residual risk.** One person holds GitHub admin and npm publish rights, and npm accepts a publish from that account as well as from CI. |
| Malicious code in a dependency, run in CI | Install scripts that steal tokens and republish (the Shai-Hulud worm, September 2025) | R3: no install scripts while an OIDC token is available, and no write token in any job that installs packages | `tsc` runs inside `publish` with the token available. A bad `typescript` release would have to get through a reviewed lockfile update first. |
| A compromised GitHub Action | A tag moved to malicious code (tj-actions/changed-files, March 2025) | Actions are pinned to commit SHAs. Dependabot proposes updates as pull requests, and the maintainer merges them by hand. | A pinned action is only as good as the commit it pins |
| Workflow injection | Untrusted pull request data reaching a privileged workflow (the Nx "s1ngularity" attack, August 2025) | No `pull_request_target`. Fork pull requests get a read-only token and no secrets. Only the maintainer can push tags, and a tag pushed with a workflow's `GITHUB_TOKEN` doesn't start another workflow, so it can't trigger a publish. | |
| A malicious version of a runtime dependency | A new `qs` or `ajv` release with a payload | Not in this project's hands. `^` ranges resolve in *your* lockfile. | Your lockfile, your review, your cooldown before taking new versions |

**Which runtime dependencies see client data?** A dependency advisory is only a vulnerability in openapi-backend if it's in a "yes" row and reachable with the inputs in §5.

| Dependency | Used for | Sees client data? |
| --- | --- | --- |
| `qs` | parsing a string query, or the `?…` part of the path | **yes** |
| `cookie` | parsing the `Cookie` header | **yes** |
| `bath-es5` | extracting and percent-decoding path params | **yes** |
| `ajv` | validating params and bodies against your schemas | **yes** |
| `lodash` | cloning and walking request objects, routing helpers | **yes** |
| `mock-json-schema` | `mockResponseForOperation` | no, operator schemas only |
| `@apidevtools/json-schema-ref-parser` | loading and dereferencing the definition | no, definition only (family A) |
| `dereference-json-schema` | dereferencing in `quick` mode | no, definition only |
| `openapi-schema-validator` | validating the definition at `init` | no, definition only |
| `openapi-types` | TypeScript types. Not loaded at runtime | no |

**What the project doesn't do.** Nothing enforces signing: most commits are signed (by the maintainer's GPG key, or by GitHub for Dependabot and web merges), but branch protection doesn't require it and release tags aren't signed. Provenance ties a release to a commit and a CI run, not to a person, and it can't tell you the commit is honest. Releases before 5.16.0 have no provenance. There is no second publisher (see the incident plan in [SECURITY.md](../SECURITY.md#incident-response-plan)). And whoever can push a tag can publish once tests pass, which today means the maintainer.

**Your part.** Commit a lockfile. Run `npm audit signatures`, and treat a 5.16.0-or-later release without provenance as an incident. Read the diff when you bump (`npm diff --diff=openapi-backend@<old> --diff=openapi-backend@<new>`). Consider a cooldown of a few days before adopting any fresh release, this library included.

## 15. Revision history

| Date | Release | Change |
| --- | --- | --- |
| 2026-09-16 | 5.21.0 | First accepted version. |
| 2026-09-29 | 5.21.2 | §12 log gains GHSA-m748-x4gc-4w5w and GHSA-fwvf-w25j-mj87, with severity, fix version and credit. P1 table, P2 gate, P3 no-alias rule, P5 and P7 caveats, P8 asymmetry and schema cost. `apiRoot` and template `RegExp` rows updated for 5.21.2. §6 lists adversary capabilities. False friends 8 and 9, §9 items 13 to 16, CodeQL query IDs in §10, a CWE column in §10a. New `unsupported-version` disposition. New §14 (release integrity) and this section. Q1 closed, Q2 corrected, Q5 to Q7 opened. |

---

### Appendix: provenance count

Documented: 34 · Maintainer: 38 · Tested: 24 · Inferred: 1. Counted by tag, so a claim with two sources counts twice. The inferred claim maps to Q4. Q2 probes an edge of a tested claim, Q3 and Q6 are process and design, Q5 and Q7 ask whether a documented behaviour should change.
