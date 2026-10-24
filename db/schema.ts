import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  userId: text('user_id').notNull(),
  actorId: text('actor_id').notNull(),
  document: text('document'),
  revision: integer('revision').notNull(),
  deleted: integer('deleted').notNull().default(0),
}, table => [primaryKey({ columns: [table.userId, table.actorId] })]);

export const researchJobs = sqliteTable('research_jobs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  actorId: text('actor_id').notNull(),
  baseRevision: integer('base_revision').notNull(),
  responseId: text('response_id'),
  status: text('status').notNull(),
  result: text('result'),
  createdAt: integer('created_at').notNull(),
});

// Review records are separate from profiles. Approval never publishes a profile.
export const galaxyReviews = sqliteTable('galaxy_reviews', {
  userId: text('user_id').notNull(), actorId: text('actor_id').notNull(),
  entryId: text('entry_id').notNull(), snapshotId: text('snapshot_id').notNull(),
  document: text('document').notNull(), revision: integer('revision').notNull(),
}, table => [primaryKey({ columns: [table.userId, table.actorId, table.entryId, table.snapshotId] })]);


export const campaignAssessments = sqliteTable('campaign_assessments', {
 id: text('id').notNull(), userId: text('user_id').notNull(), actorId: text('actor_id').notNull(),
 baseDocument: text('base_document').notNull(), document: text('document').notNull(),
 revision: integer('revision').notNull(), createdAt: text('created_at').notNull(),
}, table => [primaryKey({columns:[table.userId,table.id]})]);
