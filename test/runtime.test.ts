import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import * as State from "alchemy/State";
import { Arbitrary, Effect, FileSystem, Ref, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import TurboCache from "./fixtures/cartridge.js";
import { handoffToken } from "../src/token.js";
import CacheFixture from "./fixtures/worker.js";

const { test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `turbo_cache_runtime_${process.pid}`,
});

const Case = Schema.Struct({
  bytes: Schema.Array(Schema.Int.check(Schema.isBetween({ maximum: 255, minimum: 0 }))).check(
    Schema.isMaxLength(1024),
  ),
  duration: Schema.Int.check(Schema.isBetween({ maximum: 1_000_000, minimum: 0 })),
  hash: Schema.Int.check(Schema.isBetween({ maximum: 2_147_483_647, minimum: 0 })),
});

const deployFixture = Effect.fn(function* deployFixture(
  stack: Parameters<Parameters<typeof test.provider>[1]>[0],
) {
  // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Upstream ScratchStack.deploy erases its provider error type; the local test boundary turns it into a defect.
  const deployment = yield* Effect.orDie(stack.deploy(CacheFixture));
  return yield* Effect.fromNullishOr(deployment.url).pipe(Effect.orDie);
});

const request = (
  url: URL,
  method: "GET" | "HEAD" | "PUT" | "POST",
  token: string,
  bytes?: Uint8Array,
  duration = 0,
) => {
  const base = HttpClientRequest.make(method)(url).pipe(
    HttpClientRequest.setHeaders({
      authorization: `Bearer ${token}`,
      "x-artifact-duration": String(duration),
      "x-artifact-tag": "test-signature",
    }),
  );

  return HttpClient.execute(
    bytes === undefined ? base : base.pipe(HttpClientRequest.bodyUint8Array(bytes)),
  );
};

test.provider(
  "streams generated artifacts, isolates teams, and refuses unauthorized storage access",
  (stack) =>
    Effect.gen(function* protocolProperty() {
      const origin = yield* deployFixture(stack);
      const iteration = yield* Ref.make(0);

      const checked = yield* Arbitrary.checkEffect(
        Arbitrary.schema(Case),
        ({ bytes, hash, duration }) =>
          Effect.gen(function* roundtrip() {
            const payload = new Uint8Array(bytes);
            const id = yield* Ref.updateAndGet(iteration, (value) => value + 1);
            const path = `/v8/artifacts/${id}-${hash.toString(16)}`;
            const alpha = new URL(`${path}?slug=alpha`, origin);
            const beta = new URL(`${path}?slug=beta`, origin);

            const put = yield* request(alpha, "PUT", "test-only-alpha", payload, duration);

            expect(put.status).toBe(200);
            const get = yield* request(alpha, "GET", "test-only-alpha");
            expect(get.status).toBe(200);
            expect(new Uint8Array(yield* get.arrayBuffer)).toEqual(payload);
            expect(get.headers["x-artifact-duration"]).toBe(String(duration));
            expect(get.headers["x-artifact-tag"]).toBe("test-signature");
            const head = yield* request(alpha, "HEAD", "test-only-alpha");
            expect(head.status).toBe(get.status);
            expect(head.headers["content-length"]).toBe(String(payload.length));
            expect(head.headers["x-artifact-duration"]).toBe(get.headers["x-artifact-duration"]);
            expect(head.headers["x-artifact-tag"]).toBe(get.headers["x-artifact-tag"]);
            expect(yield* head.text).toBe("");
            const query = yield* request(
              new URL("/v8/artifacts?slug=alpha", origin),
              "POST",
              "test-only-alpha",
              new TextEncoder().encode(JSON.stringify({ hashes: [`${id}-${hash.toString(16)}`] })),
            );
            expect(yield* query.json).toEqual({
              [`${id}-${hash.toString(16)}`]: { size: payload.length, taskDurationMs: duration },
            });
            expect((yield* request(beta, "GET", "test-only-beta")).status).toBe(404);
            expect((yield* request(beta, "HEAD", "test-only-beta")).status).toBe(404);
            expect(
              (yield* request(beta, "PUT", "test-only-beta", new Uint8Array([1]))).status,
            ).toBe(200);
            const preserved = yield* request(alpha, "GET", "test-only-alpha");
            expect(new Uint8Array(yield* preserved.arrayBuffer)).toEqual(payload);

            for (const [method, endpoint] of [
              ["GET", path],
              ["HEAD", path],
              ["PUT", path],
              ["GET", "/v8/artifacts/status"],
              ["POST", "/v8/artifacts/events"],
              ["POST", "/v8/artifacts"],
            ] as const) {
              const auth = new URL(`/auth-proof${endpoint}?slug=alpha`, origin);
              expect((yield* request(auth, method, `wrong-${hash}`)).status).toBe(401);
              expect((yield* HttpClient.execute(HttpClientRequest.make(method)(auth))).status).toBe(
                401,
              );
              auth.search = "?slug=beta";
              expect((yield* request(auth, method, "test-only-alpha")).status).toBe(403);
              auth.search = "?slug=unknown";
              expect((yield* request(auth, method, "test-only-alpha")).status).toBe(403);
            }

            return true;
          }).pipe(Effect.scoped, Effect.orDie),
        { maxShrinks: 5, runs: 30 },
      );

      expect(Arbitrary.formatCheckFailure(checked)).toBeUndefined();

      for (const path of [
        "/",
        "/ping",
        "/throw-exception",
        "/internal/count",
        "/v8/artifacts/status/",
      ]) {
        expect((yield* HttpClient.get(new URL(path, origin))).status).toBe(404);
      }

      for (const suffix of [
        "",
        "?slug=alpha&slug=alpha",
        "?slug=alpha&teamId=ignored",
        "?slug=bad.slug",
      ]) {
        expect(
          (yield* request(
            new URL(`/auth-proof/v8/artifacts/abc${suffix}`, origin),
            "GET",
            "test-only-alpha",
          )).status,
        ).toBe(403);
      }
      for (const hash of ["bad.hash", "bad%2Fhash", "bad%2Bhash", "bad%20hash"]) {
        expect(
          (yield* request(
            new URL(`/auth-proof/v8/artifacts/${hash}?slug=alpha`, origin),
            "GET",
            "test-only-alpha",
          )).status,
        ).toBe(404);
      }
      const invalidQuery = yield* request(
        new URL("/auth-proof/v8/artifacts?slug=alpha", origin),
        "POST",
        "test-only-alpha",
        new TextEncoder().encode(JSON.stringify({ hashes: ["bad/hash"] })),
      );
      expect(invalidQuery.status).toBe(400);

      const status = yield* request(
        new URL("/v8/artifacts/status?slug=alpha", origin),
        "GET",
        "test-only-alpha",
      );

      expect(yield* status.json).toEqual({ status: "enabled" });
    }),
  { timeout: 180_000 },
);

test.provider(
  "the pinned Turbo binary gets a remote hit with an empty local cache",
  (stack) =>
    Effect.gen(function* turboSeam() {
      const origin = yield* deployFixture(stack);
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const directory = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(
        `${directory}/package.json`,
        JSON.stringify({
          name: "cache-protocol-fixture",
          packageManager: "pnpm@11.3.0",
          private: true,
          scripts: { build: "node build.cjs" },
        }),
      );
      yield* fs.writeFileString(
        `${directory}/pnpm-lock.yaml`,
        "lockfileVersion: '9.0'\nimporters:\n  .: {}\n",
      );
      yield* fs.writeFileString(
        `${directory}/turbo.json`,
        JSON.stringify({
          tasks: { build: { inputs: ["build.cjs"], outputs: ["out.txt"] } },
        }),
      );
      yield* fs.writeFileString(
        `${directory}/build.cjs`,
        "require('node:fs').writeFileSync('out.txt', 'built')\n",
      );

      const turbo = new URL("../node_modules/turbo/bin/turbo", import.meta.url).pathname;

      const run = (cache: string, overrides: Readonly<Record<string, string>> = {}) =>
        spawner.string(
          ChildProcess.make(
            process.execPath,
            [turbo, "run", "build", "--cache-dir", `${directory}/${cache}`, "--summarize"],
            {
              cwd: directory,
              env: {
                TURBO_API: origin,
                TURBO_CACHE: "local:rw,remote:rw",
                TURBO_TEAM: "alpha",
                TURBO_TELEMETRY_DISABLED: "1",
                TURBO_TOKEN: "test-only-alpha",
                ...overrides,
              },
              extendEnv: true,
            },
          ),
        );

      expect(yield* run("first-cache")).toContain("0 cached, 1 total");
      yield* fs.remove(`${directory}/out.txt`);
      expect(yield* run("second-cache")).toContain("1 cached, 1 total");
      expect(yield* fs.readFileString(`${directory}/out.txt`)).toBe("built");
      const summaries = yield* fs.readDirectory(`${directory}/.turbo/runs`);

      const sources = yield* Effect.all(
        summaries.map((file) => fs.readFileString(`${directory}/.turbo/runs/${file}`)),
      );

      expect(sources.some((text) => text.includes('"source": "REMOTE"'))).toBe(true);
      expect(yield* run("second-cache", { TURBO_CACHE: "local:w,remote:w" })).toContain(
        "0 cached, 1 total",
      );
      expect(
        yield* run("unconfigured-cache", {
          TURBO_API: "",
          TURBO_TEAM: "",
          TURBO_TOKEN: "",
        }),
      ).toContain("0 cached, 1 total");
    }),
  { timeout: 180_000 },
);

test.provider(
  "the rat-stack adoption contract preserves all resource fqns and the token handoff",
  (stack) =>
    Effect.gen(function* cartridgeStateHandoff() {
      // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Upstream ScratchStack.deploy erases its provider error type; the local test boundary turns it into a defect.
      const deployment = yield* Effect.orDie(stack.deploy(TurboCache));

      const state = yield* Effect.flatten(State.State).pipe(Effect.provide(stack.state));
      const fqns = yield* state.list({ stack: stack.name, stage: stack.stage });
      expect(fqns.toSorted()).toEqual([
        "TurboCache",
        "TurboCacheFoundation/TurboCacheBucket",
        "TurboCacheFoundation/TurboCacheToken-rat-stack",
      ]);

      const values = yield* handoffToken(
        (fqn) => state.get({ fqn, stack: stack.name, stage: stack.stage }).pipe(Effect.orDie),
        {
          args: [
            "-e",
            "let input=''; process.stdin.on('data',x=>input+=x); process.stdin.on('end',async()=>{ if(!/^[a-f0-9]{64}$/.test(input))process.exit(1); const response=await fetch(process.argv[1]+'/v8/artifacts/status?slug=rat-stack',{headers:{authorization:'Bearer '+input}}); process.exit(response.status===200?0:2); });",
            deployment.url ?? "",
          ],
          command: process.execPath,
          resourceNamePrefix: "TurboCache",
          team: "rat-stack",
          teams: ["rat-stack"],
        },
      );

      expect(values.TURBO_API).toBe(new URL(deployment.url ?? "").origin);
      expect(values.TURBO_TEAM).toBe("rat-stack");

      return values;
    }),
  { timeout: 180_000 },
);
