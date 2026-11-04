/**
 * Limitador simples em memória (por instância). Em serverless cada instância tem a sua contagem, então isto reduz
 * força bruta mas não é um limite global; para isso, use o Vercel Firewall/WAF ou um Redis.
 */
export class AttemptLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Segundos até poder tentar de novo, ou 0 se ainda há tentativas. */
  retryAfter(key: string): number {
    const e = this.hits.get(key);
    if (!e || e.resetAt <= Date.now()) return 0;
    return e.count >= this.max ? Math.ceil((e.resetAt - Date.now()) / 1000) : 0;
  }

  fail(key: string): void {
    const now = Date.now();
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    else e.count += 1;
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }

  clear(key: string): void {
    this.hits.delete(key);
  }
}
