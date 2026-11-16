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
  add(id, kind, sphere, attribute, start, count, delay) {
    // 同一要素的多个网格共用开始时间，已展示的要素直接保持完成状态。
    const existingEntry = this.active.find((activeEntry) => activeEntry.id === id);
    const entry = {
      id: id,
      kind: kind,
      sphere: sphere,
      attribute: attribute,
      start: start,
      count: count,
      delay: delay,
      at: this.seen.has(id) ? -100 : (existingEntry?.at ?? 100000000000000000000),
    };
    attribute.array.fill(entry.at, start, start + count);
    this.entries.push(entry);
    if (existingEntry && !this.seen.has(id)) {
      this.active.push(entry);
    } else {
      if (!this.seen.has(id)) {
        this.pending.push(entry);
      }
    }
    this.viewKey = '';
    return entry;
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
    for (const entry of this.entries) {
      this.seen.delete(entry.id);
      this.write(entry, 100000000000000000000);
    }
  }
  update(now, frustum, visibility, enabled, viewKey, suspended = false) {
    if (((this.enabled.value = enabled ? 1 : 0), suspended)) {
      this.lastTime = null;
      return false;
    }
    // 动画时间只在启用且存在活动项时累加，单帧增量封顶以保持恢复时平稳。
    if (enabled && this.active.length && this.lastTime !== null) {
      this.time.value += Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    }
    this.lastTime = now;
    const viewChanged = this.viewKey !== viewKey;
    this.viewKey = viewKey;
    // 离开视锥的未完成项重新排队；再次进入时由当前视图统一触发展示。
    for (let activeIndex = this.active.length - 1; activeIndex >= 0; activeIndex--) {
      const entry = this.active[activeIndex];
      if (visibility[entry.kind] && frustum.intersectsSphere(entry.sphere)) {
        if (!enabled || this.time.value - entry.at >= 1.5) {
          this.write(entry, -100);
          this.seen.add(entry.id);
          this.active.splice(activeIndex, 1);
        }
      } else {
        this.write(entry, 100000000000000000000);
        this.pending.push(entry);
        this.active.splice(activeIndex, 1);
      }
    }
    if (viewChanged) {
      for (let pendingIndex = this.pending.length - 1; pendingIndex >= 0; pendingIndex--) {
        const entry = this.pending[pendingIndex];
        if (!visibility[entry.kind] || !frustum.intersectsSphere(entry.sphere)) {
          continue;
        }
        const existingEntry = this.active.find((activeEntry) => activeEntry.id === entry.id);
        this.write(entry, enabled ? (existingEntry?.at ?? this.time.value + entry.delay) : -100);
        if (enabled) {
          this.active.push(entry);
          this.started++;
        } else {
          this.seen.add(entry.id);
        }
        this.pending.splice(pendingIndex, 1);
      }
    }
    return enabled && this.active.length > 0;
  }
}
export { RevealAnimation };
