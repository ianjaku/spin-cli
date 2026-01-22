import Fuse from 'fuse.js';
import type { ScriptSource, ResolvedScript } from '../types.js';

/**
 * Registry that manages script discovery and fuzzy search.
 * Scripts are resolved lazily on first access for faster startup.
 */
export class ScriptRegistry {
  private sources: ScriptSource[];
  private scripts: ResolvedScript[] = [];
  private fuse: Fuse<ResolvedScript> | null = null;
  private initialized = false;

  constructor(sources: ScriptSource[] = []) {
    this.sources = sources;
  }

  /**
   * Initialize the registry by resolving all script sources.
   * Called lazily on first palette open.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const allScripts: ResolvedScript[] = [];

    for (const source of this.sources) {
      try {
        const scripts = await source.resolve();
        allScripts.push(...scripts);
      } catch (error) {
        console.warn(`[spin] Warning: Failed to resolve script source: ${error}`);
      }
    }

    this.scripts = allScripts;
    this.initFuse();
    this.initialized = true;
  }

  /**
   * Refresh the registry by re-resolving all sources.
   */
  async refresh(): Promise<void> {
    this.initialized = false;
    this.scripts = [];
    this.fuse = null;
    await this.init();
  }

  /**
   * Get all resolved scripts.
   */
  getAll(): ResolvedScript[] {
    return this.scripts;
  }

  /**
   * Check if registry has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Search scripts using fuzzy matching.
   * Returns all scripts sorted by relevance if query is empty.
   */
  search(query: string): ResolvedScript[] {
    if (!query.trim()) {
      return this.scripts;
    }

    if (!this.fuse) {
      return this.scripts.filter(s => 
        s.displayName.toLowerCase().includes(query.toLowerCase())
      );
    }

    const results = this.fuse.search(query);
    return results.map(r => r.item);
  }

  /**
   * Initialize Fuse.js for fuzzy search.
   */
  private initFuse(): void {
    this.fuse = new Fuse(this.scripts, {
      keys: [
        { name: 'displayName', weight: 2 },
        { name: 'description', weight: 1 },
      ],
      threshold: 0.4,
      includeScore: true,
      shouldSort: true,
      minMatchCharLength: 1,
    });
  }
}
