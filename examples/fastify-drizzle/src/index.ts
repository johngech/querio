import { Database } from 'bun:sqlite';
import { defineQuery, defineRelation, QueryJSError, q } from '@queryjs/core';
import { drizzleQueryAdapter } from '@queryjs/drizzle';
import { aliasedTable, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import Fastify from 'fastify';
import qs from 'qs';
import { orgs, users } from './schema';

// Fastify's default parser (fast-querystring) is flat-only — QueryJS needs the
// nested `filter[age][gte]` form, so use qs with prototype-key protection.
// (v5 documents the parser under routerOptions.)
const app = Fastify({
  logger: true,
  routerOptions: {
    querystringParser: (str) => qs.parse(str, { allowPrototypes: false, depth: 7, comma: true }),
  },
});
const db = drizzle({ client: new Database('app.db') });

// The adapter qualifies relation columns with the relation path ('org.name'),
// so we alias the orgs table as `org`.
const org = aliasedTable(orgs, 'org');

const usersQuery = defineQuery({
  fields: {
    name: q.string().sortable().searchable().max(100),
    email: q.string().sortable().searchable().email(),
    age: q.number().sortable().min(0).max(150).integer(),
    status: q.enum(['ACTIVE', 'INACTIVE']).sortable().searchable(),
    role: q.enum(['admin', 'editor', 'viewer']).sortable().searchable(),
    createdAt: q.date().sortable(),
  },
  relations: {
    org: defineRelation({
      fields: { name: q.string().sortable().searchable() },
    }),
  },
  limits: {
    maxLimit: 50,
  },
});

app.get('/users', async (req, reply) => {
  try {
    const query = usersQuery.parse(req.query as Record<string, unknown>);
    const { where, orderBy, skip, take } = drizzleQueryAdapter.map(query);

    // The adapter emits unqualified column names, so only join the related
    // table when a relation filter actually targets it — otherwise `name`
    // (present on both tables) becomes ambiguous in WHERE/ORDER BY.
    const wantsOrgFilter = query.relations.some((r) => r.relation === 'org');

    const rows = wantsOrgFilter
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            age: users.age,
            status: users.status,
            role: users.role,
            createdAt: users.createdAt,
            orgName: org.name,
          })
          .from(users)
          .leftJoin(org, eq(users.orgId, org.id))
          .where(where)
          .orderBy(...(orderBy ?? []))
          .limit(take)
          .offset(skip)
      : await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            age: users.age,
            status: users.status,
            role: users.role,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(where)
          .orderBy(...(orderBy ?? []))
          .limit(take)
          .offset(skip);

    reply.send({
      data: rows,
      meta: { page: query.pagination.page, limit: query.pagination.limit },
    });
  } catch (error) {
    if (error instanceof QueryJSError) {
      const { message, code, field, operator, path, details } = error;
      return reply
        .status(error.statusCode)
        .send({ error: { message, code, field, operator, path, details } });
    }
    throw error;
  }
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
