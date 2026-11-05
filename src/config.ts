export interface CacheIdentity {
  readonly resourceNamePrefix: string;
}

export interface TurboCacheOptions extends CacheIdentity {
  readonly teams: readonly string[];
  readonly retentionDays: number;
  readonly main: string;
  readonly retainStages?: readonly string[];
}

export const tokenId = (options: CacheIdentity, team: string) =>
  `${options.resourceNamePrefix}Token-${team}`;

export const foundationId = (options: CacheIdentity) => `${options.resourceNamePrefix}Foundation`;

export const workerId = (options: CacheIdentity) => options.resourceNamePrefix;
