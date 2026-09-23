import { PrismaLibSql } from '@prisma/adapter-libsql';

import { PrismaClient } from './generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: 'file:./prisma/dev.db' }),
});

async function main() {
  await prisma.user.deleteMany();
  await prisma.org.deleteMany();

  const acme = await prisma.org.create({ data: { name: 'Acme' } });
  const globex = await prisma.org.create({ data: { name: 'Globex' } });

  const seeds = [
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
  ].map((u) => ({ ...u, createdAt: new Date(`2024-01-0${(u.age % 5) + 1}T10:00:00Z`) }));

  await prisma.user.createMany({ data: seeds });
  console.log(`Seeded ${seeds.length} users across 2 orgs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
