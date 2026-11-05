# ⚡ alchemy-turbo-cache

A [Turbo](https://turborepo.dev) remote cache on Cloudflare Workers and R2, declared by an [Alchemy](https://alchemy.run) Stack. One call declares a Worker, a bucket with lifecycle expiry, and a generated token for each team.

This MIT package is version `0.0.0` and is not published to npm. It was extracted from [rat-stack](https://github.com/joelhooks/rat-stack/tree/main/packages/turbo-cache).

## Install and deploy

Install from a reviewed Git commit, not the npm registry:

```sh
pnpm add github:joelhooks/alchemy-turbo-cache#<reviewed-commit>
```

The package builds its exports during installation. Use Node 24.18.0 or newer and pnpm 11.3.0. Its shared dependencies use the exact pins in `package.json`, including Effect 4.1.2 and Alchemy 2.0.0-beta.85.

Create `cache.ts`. The module must default-export the cartridge so Alchemy can load the same declaration inside the Worker runtime:

```ts
import { turboCache } from "alchemy-turbo-cache";

export default turboCache({
  main: import.meta.url,
  resourceNamePrefix: "BuildCache",
  teams: ["app"],
  retentionDays: 7,
});
```

Include it in `alchemy.run.ts`:

```ts
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Effect } from "effect";
import Cache from "./cache.js";

export default Alchemy.Stack(
  "App",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state({ workerName: "app-state-store" }),
  },
  Effect.gen(function* stack() {
    const cache = yield* Cache;
    return { cacheUrl: cache.url };
  }),
);
```

Inject `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` into the process with your secret tool, then run your Stack's authorized deployment command, for example `pnpm exec alchemy deploy --stage prod`. Do not put credentials into shell arguments, source files, or deployment output.

Every team, retention interval and resource prefix is explicit. `main` points at the module that default-exports the cartridge, not the package entry. `retainStages` defaults to `["prod"]` and applies to the Worker, bucket and generated tokens. Set it explicitly to retain other stages, or use `[]` for disposable resources.

The resource names are `${resourceNamePrefix}`, `${resourceNamePrefix}Foundation/${resourceNamePrefix}Bucket`, and `${resourceNamePrefix}Foundation/${resourceNamePrefix}Token-${team}`. Prefixes must be distinct within a Stack. Renaming a prefix or team changes resource identity; it does not rotate or migrate existing state. Retention starts at upload, reads do not extend it, and R2 lifecycle deletion is asynchronous.

## Hand off the token

After deployment, inject the same Cloudflare variables with your secret tool and run:

```sh
pnpm exec alchemy-turbo-cache-token \
  --stack App \
  --stage prod \
  --state-store app-state-store \
  --prefix BuildCache \
  --teams app \
  --team app \
  -- gh secret set TURBO_TOKEN -R <owner/repo>
```

`--stack`, `--stage`, `--state-store`, `--prefix` and `--teams` must match the deployed Stack. `--teams` accepts a comma-separated list; `--team` selects one entry. The CLI reads completed Alchemy state. It forces `CI=true` in its config provider and disables state-store provisioning, so it cannot bootstrap or upgrade the store during a read.

Only the receiving command's stdin gets the token. Its stdout and stderr are suppressed. The parent prints only `TURBO_API=<origin>` and `TURBO_TEAM=<slug>` after a successful handoff. The receiver must be trusted. Failures preserve the source tag and message, but never serialize credential fields or the source cause.

Set `TURBO_API` and `TURBO_TEAM` as repository variables using those printed values. `TURBO_API` is the origin without `/v8`. The example receiver sets `TURBO_TOKEN` as a repository secret. No GitHub or Cloudflare writes happen merely by importing this package.

## CI presets

Main and pull requests can both read and write:

```yaml
env:
  TURBO_API: ${{ vars.TURBO_API }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_CACHE: local:rw,remote:rw
  TURBO_RUN_SUMMARY: "true"
```

Fork pull requests get no secret. Do not use `pull_request_target` to give untrusted fork code a cache credential. Turbo still executes tasks when remote caching is unconfigured or unavailable.

A nightly canary should turn every read off while continuing to populate caches:

```yaml
env:
  TURBO_CACHE: local:w,remote:w
  TURBO_RUN_SUMMARY: "true"
```

Run the same tasks as main. A failing uncached canary alongside green cached checks is a reason to inspect task inputs and environment declarations for incomplete hashes, not proof that every failure is a hash bug.

Upload run summaries after either workflow, including failures:

```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: turbo-runs
    path: .turbo/runs/*.json
    include-hidden-files: true
    if-no-files-found: ignore
```

## Signing and trust

Recommend Turbo's artifact signing in `turbo.json`:

```json
{
  "remoteCache": { "signature": true }
}
```

Give trusted CI a separate `TURBO_REMOTE_CACHE_SIGNATURE_KEY`. Turbo signs and verifies artifacts; the Worker stores `x-artifact-tag` unchanged and does not verify the archive itself.

A trusted writer in a team can poison that team's cache. A team token is permission to replace artifacts, not evidence that the outputs are correct. Signing stops someone holding only the bucket or a leaked cache token from forging accepted artifacts, provided they do not also hold the signing key. A writer holding that key can still sign poisoned outputs.

Each token authorizes exactly one team slug. Missing or bad bearers get 401 before storage access; a token presented for another team gets 403. Authentication hashes each configured credential with SHA-256 and compares every digest using Workers-native `crypto.subtle.timingSafeEqual`, with no early return. Artifact hashes accept only ASCII letters, digits, `_` and `-`.

The Worker implements authenticated GET, HEAD, PUT, status, events and bulk queries under `/v8/artifacts`. There are no debug, populate, count or expiry-override routes. Bodies stream to and from R2. GET and HEAD preserve byte length, duration and signature metadata. Responses disable caching at the edge.

## Exports and checks

- `alchemy-turbo-cache`: `turboCache(options)` and `TurboCacheOptions`.
- `alchemy-turbo-cache/protocol`: `artifactHandler(storage, credentials)` and `TeamCredential` for integration in a Workers-native runtime.
- `alchemy-turbo-cache/token`: `handoffToken(readState, options)`, its options and error type.
- `alchemy-turbo-cache-token`: the stdin-only handoff executable.

```sh
pnpm install --frozen-lockfile
pnpm gate
```

The gate checks types and formatting, runs the Ultracite oxlint fence and runtime tests, then builds declarations and JavaScript. Tests run local workerd with no Cloudflare account. Generated cases check team isolation, byte-identical round trips, HEAD agreement and auth before storage. A real Turbo 2.11.9 process must get a REMOTE hit on its second run with an empty local cache. Token tests check stdin-only delivery, suppressed receiver output, safe failure diagnostics and the provisioning guard.

Local tests do not prove live account access, lifecycle deletion or GitHub credential delivery. Those checks belong to the deployment owner.

## Credit

Protocol behavior was learned from [AdiRishi/turborepo-remote-cache-cloudflare at `b0aaab5c`](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare/tree/b0aaab5c3063dd5f8d15e38e69398a0c040edcda) (MIT). The implementation was written independently against Turbo's API client. See [PROVENANCE.md](./PROVENANCE.md).

## License

MIT
