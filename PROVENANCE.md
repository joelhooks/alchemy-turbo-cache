# Provenance

## Extraction

`alchemy-turbo-cache` extracts the Turbo remote-cache cartridge from [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack), `packages/turbo-cache` at `9863202`, with the token failure diagnostics from `5e24222`. The standalone package replaces rat-stack's fixed configuration with explicit Stack integration and token-handoff options.

The standalone package layout, TypeScript diagnostics, formatting and Ultracite oxlint fence follow [joelhooks/alchemy-analytics](https://github.com/joelhooks/alchemy-analytics).

## Turbo protocol

The cartridge was independently implemented against [Turbo's v2.11.9 API client](https://github.com/vercel/turborepo/blob/v2.11.9/crates/turborepo-api-client/src/lib.rs).

The related MIT Worker implementation is [AdiRishi/turborepo-remote-cache-cloudflare](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare/tree/b0aaab5c3063dd5f8d15e38e69398a0c040edcda), pinned at `b0aaab5c3063dd5f8d15e38e69398a0c040edcda` (`b0aaab5c`). It informed protocol behavior. No upstream router, storage implementation or cron was copied. Team authorization, lifecycle policy and Effect integration came from rat-stack.

## License

MIT. See `LICENSE`.
