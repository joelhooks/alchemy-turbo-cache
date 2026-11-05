# ⚡ alchemy-turbo-cache

A [Turborepo](https://turborepo.dev) remote cache that runs on Cloudflare Workers with an R2 bucket, declared as an [Alchemy](https://alchemy.run) cartridge. Add it to an Alchemy Stack, deploy, and point CI's `TURBO_API`, `TURBO_TEAM` and `TURBO_TOKEN` at it.

## Status

The cartridge is being extracted from [rat-stack's `packages/turbo-cache`](https://github.com/joelhooks/rat-stack/tree/main/packages/turbo-cache), where it runs in production. In rat-stack CI, a pull request whose tree main had already built took 66 seconds for check, test and build instead of 871, with 88 of 91 tasks served from the cache.

## What it does

- Implements Turbo's `v8/artifacts` API: authenticated artifact GET, HEAD and PUT, status, events and bulk queries. Bodies stream to and from R2.
- Maps each generated token to one team. Artifacts live under `<team>/<hash>`, and a token for one team gets 403 on another.
- Compares bearer tokens as SHA-256 digests with the Workers-native `crypto.subtle.timingSafeEqual`.
- Expires artifacts with an R2 lifecycle rule on a bucket the cartridge owns. No cron sweeps the bucket.
- Hands the generated token to a command's stdin only, never to stdout, argv, environment or files.
- Works with Turbo's artifact signing (`remoteCache.signature`): the Worker stores the signature tag unchanged and Turbo verifies it.

## Credit

Protocol behaviour was learned from [AdiRishi/turborepo-remote-cache-cloudflare](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare) (MIT). This implementation is written independently against Turbo's API client.

## License

MIT
