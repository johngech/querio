import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { orgs, users } from './schema';

const sqlite = new Database('app.db');
const db = drizzle({ client: sqlite });

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS org (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS "user" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    age INTEGER NOT NULL,
    status TEXT NOT NULL,
    role TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,
    org_id INTEGER REFERENCES org(id)
  );
`);

await db.delete(users);
await db.delete(orgs);

const [acme, globex] = await db
  .insert(orgs)
  .values([{ name: 'Acme' }, { name: 'Globex' }])
  .returning();

const rows = [
  {
    name: 'Abebe Beke',
    email: 'abebe.beke@acme.dev',
    age: 34,
    status: 'ACTIVE',
    role: 'admin',
    orgId: acme.id,
  },
  {
    name: 'Chaltu Debela',
    email: 'chaltu.debela@globex.dev',
    age: 28,
    status: 'ACTIVE',
    role: 'editor',
    orgId: globex.id,
  },
  {
    name: 'Dawit Eshetu',
    email: 'dawit.eshetu@acme.dev',
    age: 41,
    status: 'INACTIVE',
    role: 'viewer',
    orgId: acme.id,
  },
  {
    name: 'Eden Fikadu',
    email: 'eden.fikadu@globex.dev',
    age: 19,
    status: 'ACTIVE',
    role: 'viewer',
    orgId: globex.id,
  },
  {
    name: 'Fikru Girma',
    email: 'fikru.girma@acme.dev',
    age: 52,
    status: 'ACTIVE',
    role: 'admin',
    orgId: acme.id,
  },
];

await db.insert(users).values(rows);
console.log(`Seeded ${rows.length} users across 2 orgs`);
