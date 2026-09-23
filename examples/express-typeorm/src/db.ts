import 'reflect-metadata';
import { mkdirSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { Org, User } from './entities';

// sql.js runs SQLite in WASM — no native compilation step. autoSave persists
// the DB to disk; make sure the target directory exists first.
mkdirSync('data', { recursive: true });

export const AppDataSource = new DataSource({
  type: 'sqljs',
  location: 'data/app.sqlite',
  autoSave: true,
  synchronize: true,
  entities: [Org, User],
});

export async function initDb(): Promise<DataSource> {
  if (AppDataSource.isInitialized) return AppDataSource;
  return AppDataSource.initialize();
}
