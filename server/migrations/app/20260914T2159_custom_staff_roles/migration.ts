#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/20f06f9724b706887c0fc4d91949fa5cf396472c8a7e0aba736d5f6f6b921d18/contract';
import startContract from '../../snapshots/20f06f9724b706887c0fc4d91949fa5cf396472c8a7e0aba736d5f6f6b921d18/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/96765e72b623daa7218fd9ebdd9fa6a404a7c14b5e3da12c10e0f6a771f70551/contract';
import endContract from '../../snapshots/96765e72b623daa7218fd9ebdd9fa6a404a7c14b5e3da12c10e0f6a771f70551/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'School',
        column: col('customStaffRoles', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('roleTitle', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
