// Tiny typed event emitter used for store→sync change feed and editor buses.
type Handler<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, any>> {
  private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, fn: Handler<Events[K]>): () => void {
    (this.handlers[event] ??= new Set()).add(fn);
    return () => this.handlers[event]?.delete(fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers[event]?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[events]', e); }
    });
  }
}

/** Change feed consumed by the sync layer. `remote` marks writes that came FROM sync (no echo). */
export interface ChangeEvent {
  table: 'pages' | 'blocks' | 'comments';
  id: string;
  doc: any | null;          // null = hard delete
  remote?: boolean;
}

export const storeEvents = new Emitter<{ change: ChangeEvent; ready: void }>();
