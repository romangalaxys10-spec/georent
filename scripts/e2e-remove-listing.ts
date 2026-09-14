/**
 * E2E helper: remove one mid-priced Tbilisi listing from the DB so the
 * scanner's next cycle re-sees it and classifies it as NEW (deterministic
 * notification for the UI integration test). Prints what it removed.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // THE newest actualized listing overall — page 1 of the scanner's
  // update_time_desc fetch, so it is guaranteed to be re-seen as NEW.
  const target = await db.listing.findFirst({
    where: { cityId: 1 },
    orderBy: { actualizeTime: 'desc' },
    select: { objectId: true, price: true, districtName: true, roomCount: true, area: true },
  });
  if (!target) {
    console.log('NO_TARGET_FOUND');
    return;
  }
  await db.listing.delete({ where: { objectId: target.objectId } });
  console.log(
    `REMOVED objectId=${target.objectId} price=$${target.price} district=${target.districtName} rooms=${target.roomCount} area=${target.area}`,
  );
}

main()
  .catch((err) => {
    console.error('e2e-seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
