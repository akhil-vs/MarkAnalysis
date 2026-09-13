import { ensurePlatformAdmin } from "../src/lib/ensurePlatformAdmin.js";
import { prisma } from "../src/lib/prisma.js";
import { runWithoutTenant } from "../src/lib/tenant.js";

const result = await runWithoutTenant(() => ensurePlatformAdmin(prisma));
if (result.skipped) {
  console.log(`ensurePlatformAdmin skipped: ${result.reason}`);
} else if (result.created) {
  console.log(`Created platform admin ${result.user.email}`);
} else if (result.updated) {
  console.log(`Updated platform admin ${result.user.email}`);
} else {
  console.log(`Platform admin already present: ${result.user.email}`);
}
await prisma.$disconnect();
