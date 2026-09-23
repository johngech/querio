import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const orgs = sqliteTable('org', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const users = sqliteTable('user', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  age: integer('age').notNull(),
  status: text('status').notNull(),
  role: text('role').notNull(),
  // QueryJS field names map verbatim to column identifiers, so the DB column
  // must be named exactly like the field (`createdAt`, not `created_at`).
  createdAt: integer('createdAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  orgId: integer('org_id').references(() => orgs.id),
});

export const orgsRelations = relations(orgs, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
  org: one(orgs, { fields: [users.orgId], references: [orgs.id] }),
}));
