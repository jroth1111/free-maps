export interface R2ConditionalLike { etagMatches?: string }
export interface R2ObjectLike {
  size: number;
  etag: string;
  httpEtag: string;
  body?: ReadableStream;
  httpMetadata?: { cacheControl?: string; cacheExpiry?: Date };
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string, options?: { range?: { offset: number; length: number }; onlyIf?: R2ConditionalLike }): Promise<R2ObjectLike | null>;
}
export interface ExecutionContextLike { waitUntil(promise: Promise<unknown>): void }
export interface AssetFetcherLike { fetch(request: Request): Promise<Response> }
