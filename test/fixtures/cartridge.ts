import { turboCache } from "alchemy-turbo-cache";

export default turboCache({
  main: import.meta.url,
  resourceNamePrefix: "FixtureCache",
  retentionDays: 7,
  teams: ["alpha"],
});
