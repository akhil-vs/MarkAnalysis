#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/d5a473f72d3c3c660dba065cdd41420abba059d9188aa67e05c0596c847c20bf/contract';
import startContract from '../../snapshots/d5a473f72d3c3c660dba065cdd41420abba059d9188aa67e05c0596c847c20bf/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e77656044c13445c61749199135b6978876f1bc70850fd1b41679332f6dc293d/contract';
import endContract from '../../snapshots/e77656044c13445c61749199135b6978876f1bc70850fd1b41679332f6dc293d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'School',
        column: col('academicYears', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'School',
        column: col('currentAcademicYear', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
