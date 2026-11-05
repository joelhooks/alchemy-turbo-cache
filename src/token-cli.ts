#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node";
import * as Alchemist from "alchemy/Alchemist";
import { Console, Effect, Schema } from "effect";

import { deployedCacheState } from "./read-state.js";
import { stateReadFailure } from "./token-failure.js";
import { handoffToken, TokenHandoffError } from "./token.js";

const Flags = Schema.Struct({
  "--prefix": Schema.NonEmptyString,
  "--stack": Schema.NonEmptyString,
  "--stage": Schema.NonEmptyString,
  "--state-store": Schema.NonEmptyString,
  "--team": Schema.NonEmptyString,
  "--teams": Schema.NonEmptyString,
});

const main = Effect.gen(function* tokenMain() {
  const args = process.argv.slice(2);
  const separator = args.indexOf("--");
  const flags = args.slice(0, separator);
  const command = args[separator + 1];
  const names = Object.keys(Flags.fields);
  if (
    separator !== 12 ||
    command === undefined ||
    names.some((name) => !flags.some((flag, index) => index % 2 === 0 && flag === name))
  ) {
    return yield* new TokenHandoffError({
      message:
        "The token handoff arguments are invalid. Stack identity and receiver must be explicit. Fix: pass --stack, --stage, --state-store, --prefix, --teams, --team, then -- <command> [args].",
    });
  }
  const parsed = yield* Schema.decodeUnknownEffect(Flags)(
    Object.fromEntries(names.map((name) => [name, flags[flags.indexOf(name) + 1]])),
  ).pipe(
    Effect.mapError(
      () =>
        new TokenHandoffError({
          message:
            "The token handoff configuration is incomplete. Every identity flag needs a value. Fix: supply each flag exactly once.",
        }),
    ),
  );

  const store = yield* deployedCacheState(parsed["--state-store"]).pipe(
    Effect.catchCause((cause) => Effect.fail(stateReadFailure(cause))),
  );
  const values = yield* handoffToken(
    (fqn) =>
      store
        .get({ fqn, stack: parsed["--stack"], stage: parsed["--stage"] })
        .pipe(Effect.catchCause((cause) => Effect.fail(stateReadFailure(cause)))),
    {
      args: args.slice(separator + 2),
      command,
      resourceNamePrefix: parsed["--prefix"],
      team: parsed["--team"],
      teams: parsed["--teams"].split(","),
    },
  );
  yield* Console.log(`TURBO_API=${values.TURBO_API}\nTURBO_TEAM=${values.TURBO_TEAM}`);
  return values;
}).pipe(Effect.scoped, Effect.provide(Alchemist.layer()));

NodeRuntime.runMain(main);
