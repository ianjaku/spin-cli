export class OutputBuffer {
  private buffer: string[];
  private start = 0;
  private size = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(0, capacity);
    this.buffer = this.capacity > 0 ? new Array(this.capacity) : [];
  }

  clear(): void {
    this.start = 0;
    this.size = 0;
  }

  push(line: string): void {
    if (this.capacity === 0) return;

    if (this.size < this.capacity) {
      this.buffer[(this.start + this.size) % this.capacity] = line;
      this.size += 1;
      return;
    }

    this.buffer[this.start] = line;
    this.start = (this.start + 1) % this.capacity;
  }

  toArray(): string[] {
    if (this.size === 0) return [];
    if (this.size === this.capacity && this.start === 0) {
      return this.buffer.slice();
    }

    const output = new Array<string>(this.size);
    for (let i = 0; i < this.size; i += 1) {
      output[i] = this.buffer[(this.start + i) % this.capacity]!;
    }
    return output;
  }

  tail(count: number): string[] {
    if (this.size === 0) return [];
    const len = Math.min(this.size, Math.max(0, count));
    if (len === 0) return [];

    const output = new Array<string>(len);
    const startIndex = (this.start + this.size - len + this.capacity) % this.capacity;
    for (let i = 0; i < len; i += 1) {
      output[i] = this.buffer[(startIndex + i) % this.capacity]!;
    }
    return output;
  }

  get length(): number {
    return this.size;
  }
}
