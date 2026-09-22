#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/176eac814fef73ddfd3eb82de454156e0944a581824b660335ec52309b70bd4a/contract';
import startContract from '../../snapshots/176eac814fef73ddfd3eb82de454156e0944a581824b660335ec52309b70bd4a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/46d359e0d2a6125ed5181e4b2aff1177b4aa4e0819dd8f649a77081ae72bc578/contract';
import endContract from '../../snapshots/46d359e0d2a6125ed5181e4b2aff1177b4aa4e0819dd8f649a77081ae72bc578/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'SubjectPoolItem',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isElective', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('maxMarks', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('practicalMaxMarks', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('tenantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'SubjectPoolItem',
        constraint: 'SubjectPoolItem_tenantId_name_key',
        columns: ['tenantId', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SubjectPoolItem',
        index: 'SubjectPoolItem_tenantId_idx_c93ed4f1',
        columns: ['tenantId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SubjectPoolItem',
        foreignKey: {
          name: 'SubjectPoolItem_tenantId_fkey',
          columns: ['tenantId'],
          references: { schema: 'public', table: 'School', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
