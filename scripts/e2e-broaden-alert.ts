/**
 * E2E helper: broaden the alert used by the UI integration test (any
 * district, maxPrice 200000) so a re-seen NEW listing always matches it.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const alert = await db.alert.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!alert) {
    console.log('NO_ALERT');
    return;
  }
  await db.alert.update({
    where: { id: alert.id },
    data: { districtIds: '[]', maxPrice: 200_000 },
  });
  console.log(`BROADENED alert=${alert.id} "${alert.name}" → any district, max $200000`);
}

main()
  .catch((err) => {
    console.error('e2e-broaden-alert failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
