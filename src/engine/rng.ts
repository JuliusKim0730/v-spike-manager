/** Seeded RNG (mulberry32) so the same save replays the same match. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }

  get state(): number { return this.s; }
  set state(v: number) { this.s = v >>> 0; }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p: number): boolean { return this.next() < p; }

  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }

  pickWeighted<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}
