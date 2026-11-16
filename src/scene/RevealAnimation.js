// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class RevealAnimation {
  constructor(seen) {
    this.seen = seen;
    this.time = {
      value: 0,
    };
    this.enabled = {
      value: 1,
    };
    this.entries = [];
    this.pending = [];
    this.active = [];
    this.lastTime = null;
    this.viewKey = '';
    this.started = 0;
  }
  clear() {
    this.entries.length = 0;
    this.pending.length = 0;
    this.active.length = 0;
    this.time.value = 0;
    this.lastTime = null;
    this.viewKey = '';
  }
  add(i, o, p, x, T, w, l) {
    const D = this.active.find((U) => U.id === i);
    const F = {
      id: i,
      kind: o,
      sphere: p,
      attribute: x,
      start: T,
      count: w,
      delay: l,
      at: this.seen.has(i) ? -100 : (D?.at ?? 100000000000000000000),
    };
    x.array.fill(F.at, T, T + w);
    this.entries.push(F);
    if (D && !this.seen.has(i)) {
      this.active.push(F);
    } else {
      if (!this.seen.has(i)) {
        this.pending.push(F);
      }
    }
    this.viewKey = '';
    return F;
  }
  write(entry, time) {
    entry.at = time;
    entry.attribute.array.fill(time, entry.start, entry.start + entry.count);
    entry.attribute.addUpdateRange(entry.start, entry.count);
    entry.attribute.needsUpdate = true;
  }
  replay() {
    this.time.value = 0;
    this.lastTime = null;
    this.viewKey = '';
    this.active.length = 0;
    this.pending = [...this.entries];
    for (const i of this.entries) {
      this.seen.delete(i.id);
      this.write(i, 100000000000000000000);
    }
  }
  update(i, o, p, x, T, w = false) {
    if (((this.enabled.value = x ? 1 : 0), w)) {
      this.lastTime = null;
      return false;
    }
    if (x && this.active.length && this.lastTime !== null) {
      this.time.value += Math.min(0.05, Math.max(0, (i - this.lastTime) / 1000));
    }
    this.lastTime = i;
    const l = this.viewKey !== T;
    this.viewKey = T;
    for (let D = this.active.length - 1; D >= 0; D--) {
      const F = this.active[D];
      if (p[F.kind] && o.intersectsSphere(F.sphere)) {
        if (!x || this.time.value - F.at >= 1.5) {
          this.write(F, -100);
          this.seen.add(F.id);
          this.active.splice(D, 1);
        }
      } else {
        this.write(F, 100000000000000000000);
        this.pending.push(F);
        this.active.splice(D, 1);
      }
    }
    if (l) {
      for (let D = this.pending.length - 1; D >= 0; D--) {
        const F = this.pending[D];
        if (!p[F.kind] || !o.intersectsSphere(F.sphere)) {
          continue;
        }
        const U = this.active.find((j) => j.id === F.id);
        this.write(F, x ? (U?.at ?? this.time.value + F.delay) : -100);
        if (x) {
          this.active.push(F);
          this.started++;
        } else {
          this.seen.add(F.id);
        }
        this.pending.splice(D, 1);
      }
    }
    return x && this.active.length > 0;
  }
}
export { RevealAnimation };
