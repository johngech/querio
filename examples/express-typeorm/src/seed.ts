import 'reflect-metadata';
import { AppDataSource, initDb } from './db';
import { Org, User } from './entities';

await initDb();
const userRepo = AppDataSource.getRepository(User);
const orgRepo = AppDataSource.getRepository(Org);

await userRepo.clear();
await orgRepo.clear();

const acme = await orgRepo.save({ name: 'Acme' });
const globex = await orgRepo.save({ name: 'Globex' });

const rows = [
  {
    name: 'Abebe Beke',
    email: 'abebe.beke@acme.dev',
    age: 34,
    status: 'ACTIVE',
    role: 'admin',
    org: acme,
  },
  {
    name: 'Chaltu Debela',
    email: 'chaltu.debela@globex.dev',
    age: 28,
    status: 'ACTIVE',
    role: 'editor',
    org: globex,
  },
  {
    name: 'Dawit Eshetu',
    email: 'dawit.eshetu@acme.dev',
    age: 41,
    status: 'INACTIVE',
    role: 'viewer',
    org: acme,
  },
  {
    name: 'Eden Fikadu',
    email: 'eden.fikadu@globex.dev',
    age: 19,
    status: 'ACTIVE',
    role: 'viewer',
    org: globex,
  },
  {
    name: 'Fikru Girma',
    email: 'fikru.girma@acme.dev',
    age: 52,
    status: 'ACTIVE',
    role: 'admin',
    org: acme,
  },
];

await userRepo.save(rows);
console.log(`Seeded ${rows.length} users across 2 orgs`);
