#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/673a79cf07ebf860ede493573ab8713d26cb9936f7c7e4721e74f519c8d60f51/contract';
import endContract from '../../snapshots/673a79cf07ebf860ede493573ab8713d26cb9936f7c7e4721e74f519c8d60f51/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e77656044c13445c61749199135b6978876f1bc70850fd1b41679332f6dc293d/contract';
import startContract from '../../snapshots/e77656044c13445c61749199135b6978876f1bc70850fd1b41679332f6dc293d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'School',
        column: col('assessmentPolicy', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Subject',
        column: col('category', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'SubjectPoolItem',
        column: col('category', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
