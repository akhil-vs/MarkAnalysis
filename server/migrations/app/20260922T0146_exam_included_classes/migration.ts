#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/46d359e0d2a6125ed5181e4b2aff1177b4aa4e0819dd8f649a77081ae72bc578/contract';
import startContract from '../../snapshots/46d359e0d2a6125ed5181e4b2aff1177b4aa4e0819dd8f649a77081ae72bc578/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d5a473f72d3c3c660dba065cdd41420abba059d9188aa67e05c0596c847c20bf/contract';
import endContract from '../../snapshots/d5a473f72d3c3c660dba065cdd41420abba059d9188aa67e05c0596c847c20bf/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Exam',
        column: col('includedClassNames', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
