#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/f8092f78233e9015d4a074b236036fd5c70f7cb5a647898f7d579609d7241aff/contract';
import endContract from '../../snapshots/f8092f78233e9015d4a074b236036fd5c70f7cb5a647898f7d579609d7241aff/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'jobPreference',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('employmentTypes', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('excludedKeywords', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('locations', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('minimumMatchScore', 'int4', {
            notNull: true,
            default: lit(50),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('targetRoles', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'jobPreference_employmentTypes_elem_not_null_15e27405',
            'array_position("employmentTypes", NULL) IS NULL',
          ),
          checkExpression(
            'jobPreference_excludedKeywords_elem_not_null_4947c98d',
            'array_position("excludedKeywords", NULL) IS NULL',
          ),
          checkExpression(
            'jobPreference_locations_elem_not_null_35aec250',
            'array_position("locations", NULL) IS NULL',
          ),
          checkExpression(
            'jobPreference_targetRoles_elem_not_null_e2f5bf9a',
            'array_position("targetRoles", NULL) IS NULL',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'skill',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expertise', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'skill_expertise_check_5ed1c8aa',
            "\"expertise\" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'userProfile',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('firstName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('headline', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lastName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('summary', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('yearsOfExperience', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'skill',
        constraint: 'skill_name_key',
        columns: ['name'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
