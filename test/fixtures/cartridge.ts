import { turboCache } from "alchemy-turbo-cache";

export default turboCache({
  main: import.meta.url,
  resourceNamePrefix: "TurboCache",
  retentionDays: 7,
  teams: ["rat-stack"],
});
