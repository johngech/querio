import 'reflect-metadata';
import { defineQuery, defineRelation, QueryJSError, q } from '@queryjs/core';
import { typeormQueryAdapter } from '@queryjs/typeorm';
import express from 'express';
import { AppDataSource, initDb } from './db';
import { User } from './entities';

await initDb();
const app = express();

// Express 5 defaults to the flat 'simple' query parser; QueryJS filter syntax
// relies on qs's nested-object parsing, so opt into the 'extended' parser.
app.set('query parser', 'extended');
const userRepo = AppDataSource.getRepository(User);

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

app.get('/users', async (req, res) => {
  try {
    const query = usersQuery.parse(req.query);
    const { where, orderBy, skip, take } = typeormQueryAdapter.map(query);
    const [data, total] = await userRepo.findAndCount({
      where,
      order: orderBy,
      skip,
      take,
      relations: { org: true },
    });
    res.json({ data, meta: { total, page: query.pagination.page, limit: query.pagination.limit } });
  } catch (error) {
    if (error instanceof QueryJSError) {
      const { message, code, field, operator, path, details } = error;
      res
        .status(error.statusCode)
        .json({ error: { message, code, field, operator, path, details } });
      return;
    }
    throw error;
  }
});

const port = Number(process.env.PORT ?? 3002);
app.listen(port, () => console.log(`express-typeorm listening on http://localhost:${port}`));
