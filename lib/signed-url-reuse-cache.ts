type SignedUrlEntry = {
  url: string;
  reusableUntil: number;
};

export class SignedUrlReuseCache {
  private readonly entries = new Map<string, SignedUrlEntry>();
  private readonly reuseMs: number;
  private readonly maxEntries: number;

  constructor(reuseMs: number, maxEntries = 512) {
    this.reuseMs = reuseMs;
    this.maxEntries = maxEntries;
  }

  read(paths: string[], now = Date.now()) {
    const urls = new Map<string, string>();
    for (const path of paths) {
      const entry = this.entries.get(path);
      if (!entry) continue;
      if (entry.reusableUntil <= now) {
        this.entries.delete(path);
        continue;
      }
      urls.set(path, entry.url);
    }
    return urls;
  }

  write(path: string, url: string, now = Date.now()) {
    this.entries.delete(path);
    this.entries.set(path, { url, reusableUntil: now + this.reuseMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.entries.delete(oldest);
    }
  }

  invalidate(path: string) {
    this.entries.delete(path);
  }
}
