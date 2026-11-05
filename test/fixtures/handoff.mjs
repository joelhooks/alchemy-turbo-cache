import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Redacted } from "effect";

import { handoffToken } from "../../dist/token.js";

const token = "test-only-handoff-secret";

NodeRuntime.runMain(
  handoffToken(
    (fqn) =>
      Effect.succeed(
        fqn === "ExampleWorker"
          ? { attr: { url: "https://cache.example.test" }, status: "updated" }
          : {
              attr: { text: Redacted.make(token) },
              resourceType: "Alchemy.Random",
              status: "created",
            },
      ),
    {
      args: [
        "-e",
        "process.stdin.on('data', chunk => { process.stdout.write(chunk); process.stderr.write(chunk); });",
      ],
      command: process.execPath,
      resourceNamePrefix: "Example",
      team: "alpha",
      teams: ["alpha"],
    },
  ).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
