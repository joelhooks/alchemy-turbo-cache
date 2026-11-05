# Agent instructions

A team-isolated Turbo remote cache for Alchemy and Effect.

- This repo is public. Keep credentials, account ids, private paths, hostnames and customer data out of code, tests and docs. Examples use generic ids and `example.test`.
- No prose comments in code. Name the behavior in functions and tests.
- Preserve authentication before storage. Compare SHA-256 digests for every configured token with Workers-native `crypto.subtle.timingSafeEqual`, without an early return. A token must authorize the requested team slug.
- Preserve streaming bytes, artifact duration and signature metadata. Do not add debug, populate or expiry-override routes.
- Tokens go only to a trusted receiver's stdin. Never print them, place them in argv or environment variables, or serialize state or credential fields into errors. The read-only handoff must force `CI=true` and disable state provisioning.
- Every guard needs a test that fails when the guard breaks. Plant and revert a bug before trusting a new property.
- Errors read `<what>. <why>. Fix: <step>`.
- Shared dependency pins equal rat-stack's. No dependency additions without the owner's approval. Read installed `effect/AGENTS.md` and the exact pinned source before changing Effect APIs.
- `main` must point at a module that default-exports the configured cartridge. Keep worker, foundation and token ids aligned with the token reader. Changing resource identity can replace retained resources.
- `pnpm gate` runs check, test and build. The real-Turbo seam and workerd properties are required, not optional network tests. Tests must not deploy to Cloudflare.
- Never publish to npm or deploy as part of this repo's gate. See `PROVENANCE.md` for credits.
