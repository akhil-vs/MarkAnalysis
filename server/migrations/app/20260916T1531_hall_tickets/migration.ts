#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/176eac814fef73ddfd3eb82de454156e0944a581824b660335ec52309b70bd4a/contract';
import endContract from '../../snapshots/176eac814fef73ddfd3eb82de454156e0944a581824b660335ec52309b70bd4a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5513bd333417d776427f03beaf0483d3d36cd8edae48636a6d9097c4069e6297/contract';
import startContract from '../../snapshots/5513bd333417d776427f03beaf0483d3d36cd8edae48636a6d9097c4069e6297/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addNativeEnumValue({
        schema: 'public',
        typeName: 'AuditAction',
        value: 'HALL_TICKET_CREATED',
      }),
      this.addNativeEnumValue({
        schema: 'public',
        typeName: 'AuditAction',
        value: 'HALL_TICKET_UPDATED',
      }),
      this.addNativeEnumValue({
        schema: 'public',
        typeName: 'AuditAction',
        value: 'HALL_TICKET_DELETED',
      }),
      this.createTable({
        schema: 'public',
        table: 'HallTicketIssue',
        columns: [
          col('classSectionId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('createdById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('defaultVenue', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('examCentre', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('examId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('includePhoto', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('instructions', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('internalNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tenantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('updatedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'School',
        column: col('optionalModules', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Student',
        column: col('admissionNo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Student',
        column: col('photoBytes', 'bytea', { codecRef: { codecId: 'pg/bytea@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Student',
        column: col('photoMimeType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'HallTicketIssue',
        constraint: 'HallTicketIssue_examId_classSectionId_key',
        columns: ['examId', 'classSectionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'HallTicketIssue',
        index: 'HallTicketIssue_classSectionId_idx_095a6e92',
        columns: ['classSectionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'HallTicketIssue',
        index: 'HallTicketIssue_createdById_idx_8bf640ed',
        columns: ['createdById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'HallTicketIssue',
        index: 'HallTicketIssue_examId_idx_a57bdadd',
        columns: ['examId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'HallTicketIssue',
        index: 'HallTicketIssue_tenantId_examId_idx_b62d70cd',
        columns: ['tenantId', 'examId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'HallTicketIssue',
        index: 'HallTicketIssue_tenantId_idx_c93ed4f1',
        columns: ['tenantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'HallTicketIssue',
        index: 'HallTicketIssue_updatedById_idx_d0517c24',
        columns: ['updatedById'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'HallTicketIssue',
        foreignKey: {
          name: 'HallTicketIssue_tenantId_fkey',
          columns: ['tenantId'],
          references: { schema: 'public', table: 'School', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'HallTicketIssue',
        foreignKey: {
          name: 'HallTicketIssue_examId_fkey',
          columns: ['examId'],
          references: { schema: 'public', table: 'Exam', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'HallTicketIssue',
        foreignKey: {
          name: 'HallTicketIssue_classSectionId_fkey',
          columns: ['classSectionId'],
          references: { schema: 'public', table: 'ClassSection', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'HallTicketIssue',
        foreignKey: {
          name: 'HallTicketIssue_createdById_fkey',
          columns: ['createdById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'HallTicketIssue',
        foreignKey: {
          name: 'HallTicketIssue_updatedById_fkey',
          columns: ['updatedById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
