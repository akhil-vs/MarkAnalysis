#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/053fca134d63b7425602d07fa31a9b4301919a215457589310cb55c8bd4c34ab/contract';
import endContract from '../../snapshots/053fca134d63b7425602d07fa31a9b4301919a215457589310cb55c8bd4c34ab/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/673a79cf07ebf860ede493573ab8713d26cb9936f7c7e4721e74f519c8d60f51/contract';
import startContract from '../../snapshots/673a79cf07ebf860ede493573ab8713d26cb9936f7c7e4721e74f519c8d60f51/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'PilotRequestStatus',
        members: ['PENDING', 'CONTACTED', 'DECLINED', 'PROVISIONED'],
      }),
      this.createTable({
        schema: 'public',
        table: 'PilotRequest',
        columns: [
          col('board', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('contactEmail', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contactName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contactPhone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('examNameOrType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('preferredStartDate', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('reviewedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('roleTitle', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('schoolId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('schoolName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceIp', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', '"PilotRequestStatus"', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'PilotRequestStatus' } },
          }),
          col('targetClasses', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userAgent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('workspace', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'ActivityAudit',
        index: 'ActivityAudit_tenantId_timestamp_idx_699dc902',
        columns: ['tenantId', 'timestamp'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Mark',
        index: 'Mark_tenantId_examId_status_idx_75eb183c',
        columns: ['tenantId', 'examId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PilotRequest',
        index: 'PilotRequest_contactEmail_createdAt_idx_0cbf81e4',
        columns: ['contactEmail', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PilotRequest',
        index: 'PilotRequest_reviewedById_idx_e2835478',
        columns: ['reviewedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PilotRequest',
        index: 'PilotRequest_schoolId_idx_82b454d7',
        columns: ['schoolId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PilotRequest',
        index: 'PilotRequest_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Subject',
        index: 'Subject_tenantId_className_idx_530d6bbe',
        columns: ['tenantId', 'className'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PilotRequest',
        foreignKey: {
          name: 'PilotRequest_schoolId_fkey',
          columns: ['schoolId'],
          references: { schema: 'public', table: 'School', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PilotRequest',
        foreignKey: {
          name: 'PilotRequest_reviewedById_fkey',
          columns: ['reviewedById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
