import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

export const people = sqliteTable('people', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  bg: text('bg').notNull().default('online'),
  strength: real('strength').notNull().default(5),
  tags: text('tags').notNull().default('[]'),
  description: text('description').notNull().default(''),
  pinToMe: integer('pin_to_me', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

export const thoughts = sqliteTable('thoughts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

export const mentions = sqliteTable('mentions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  thoughtId: integer('thought_id').notNull().references(() => thoughts.id, { onDelete: 'cascade' }),
  personId: integer('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
});

export const edgeOverrides = sqliteTable('edge_overrides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  aId: integer('a_id').notNull(),
  bId: integer('b_id').notNull(),
  weight: real('weight'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
});

export const bucketNames = sqliteTable('bucket_names', {
  bg: text('bg').primaryKey(),
  name: text('name').notNull().default(''),
  meWeight: real('me_weight'),
  meHidden: integer('me_hidden', { mode: 'boolean' }).notNull().default(false),
});

export const clusterEdges = sqliteTable('cluster_edges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bgA: text('bg_a').notNull(),
  bgB: text('bg_b').notNull(),
  weight: real('weight').notNull().default(5),
});

export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
export type Thought = typeof thoughts.$inferSelect;
export type Mention = typeof mentions.$inferSelect;
export type EdgeOverride = typeof edgeOverrides.$inferSelect;
export type BucketName = typeof bucketNames.$inferSelect;
