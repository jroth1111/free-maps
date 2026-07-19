declare module "cloudflare:workers" {
  export abstract class WorkerEntrypoint<TEnv = unknown> {
    protected readonly env: TEnv;
  }
}
