// Fixed-size index pool: zero allocations after construction.
export class IndexPool {
  constructor(capacity) {
    this.capacity = capacity;
    this.active = new Uint8Array(capacity);
    this.free = new Array(capacity);
    this.freeCount = capacity;
    for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
  }

  get activeCount() {
    return this.capacity - this.freeCount;
  }

  /** @returns {number} index, or -1 if the pool is exhausted */
  acquire() {
    if (this.freeCount === 0) return -1;
    const i = this.free[--this.freeCount];
    this.active[i] = 1;
    return i;
  }

  release(i) {
    if (!this.active[i]) return;
    this.active[i] = 0;
    this.free[this.freeCount++] = i;
  }

  releaseAll() {
    this.freeCount = 0;
    for (let i = this.capacity - 1; i >= 0; i--) {
      this.active[i] = 0;
      this.free[this.freeCount++] = i;
    }
  }

  forEachActive(cb) {
    for (let i = 0; i < this.capacity; i++) {
      if (this.active[i]) cb(i);
    }
  }
}
