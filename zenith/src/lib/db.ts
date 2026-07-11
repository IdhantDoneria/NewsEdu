import Dexie, { type Table } from 'dexie';
import type { Block, CommentDoc, PageDoc, Snapshot } from './types';

export interface KV { key: string; value: any }

class ZenithDB extends Dexie {
  pages!: Table<PageDoc, string>;
  blocks!: Table<Block, string>;
  comments!: Table<CommentDoc, string>;
  snapshots!: Table<Snapshot, string>;
  kv!: Table<KV, string>;

  constructor() {
    super('zenith');
    this.version(1).stores({
      pages: 'id, parentId, databaseId, deletedAt, updatedAt',
      blocks: 'id, pageId, parentId, updatedAt',
      comments: 'id, pageId, updatedAt',
      snapshots: 'id, pageId, ts',
      kv: 'key',
    });
  }
}

export const db = new ZenithDB();

export async function kvGet<T = any>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function kvSet(key: string, value: any): Promise<void> {
  await db.kv.put({ key, value });
}
