#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5513bd333417d776427f03beaf0483d3d36cd8edae48636a6d9097c4069e6297/contract';
import endContract from '../../snapshots/5513bd333417d776427f03beaf0483d3d36cd8edae48636a6d9097c4069e6297/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/96765e72b623daa7218fd9ebdd9fa6a404a7c14b5e3da12c10e0f6a771f70551/contract';
import startContract from '../../snapshots/96765e72b623daa7218fd9ebdd9fa6a404a7c14b5e3da12c10e0f6a771f70551/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'School',
        column: col('roleFeatureAccess', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
