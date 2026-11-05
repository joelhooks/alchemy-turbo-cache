# Mutation checks

Each planted bug was tested in isolation and reverted. Every final mutation produced a failing test, not a compiler failure. The normal gate runs with the original implementation restored.

| Property                         | Planted bug                                                  | Observed failure                                    |
| -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| Team isolation                   | Remove the team prefix from the R2 artifact key.             | The other team's GET returned 200 instead of 404.   |
| Byte-identical round trip        | Store `corrupt` instead of the request body.                 | Returned bytes did not equal the generated payload. |
| HEAD agrees with GET             | Return status 201 for a successful HEAD.                     | HEAD status differed from GET's 200.                |
| Bad bearer never reaches storage | Call `bucket.head` before returning the bad-bearer 401.      | The fixture's forbidden storage function ran.       |
| Real Turbo remote hit            | Acknowledge PUT without storing the artifact.                | The second run did not report `1 cached, 1 total`.  |
| Token delivered through stdin    | Send an empty stream instead of the deployed token.          | The receiver failed its hash check.                 |
| Receiver stdout suppressed       | Change stdout from `ignore` to `inherit`.                    | The outer process captured the fixture token.       |
| Receiver stderr suppressed       | Change stderr from `ignore` to `inherit`.                    | The outer process captured the fixture token.       |
| Read-only state                  | Enable state updates and set the local CI override to false. | Bootstrap or upgrade no longer failed as required.  |
| Source diagnostics preserved     | Replace the source tag and message with a generic failure.   | The source tag assertion failed.                    |
| Credential fields excluded       | Serialize the whole source failure into the message.         | The error included the fixture credential field.    |

## Test repaired during extraction

The inherited receiver-output test spied on the parent's JavaScript `process.stdout.write` and `process.stderr.write`. The stdout-inheritance mutation survived because a child's inherited file descriptor does not call those JavaScript methods.

`test/fixtures/handoff.mjs` now runs the built token helper in a separate process. A receiver deliberately echoes its stdin to both output streams. `test/token.test.ts` captures that process's combined output and requires it to be empty. Both the stdout and stderr inheritance mutations fail this stronger check.

The existing stdin hash check also verifies that the token is absent from the receiver's argv and environment. The runtime suite additionally checks signature metadata, bulk queries, invalid hash characters, duplicate slugs and rejected team ids.
