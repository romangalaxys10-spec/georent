/** Remove one listing by objectId (must be inside the scanner's live fetch window). */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const objectId = Number(process.argv[2]);
if (!Number.isFinite(objectId)) { console.error('usage: bun e2e-remove-object.ts <objectId>'); process.exit(1); }
await db.listing.delete({ where: { objectId } }).catch(() => console.log('ALREADY_GONE'));
console.log('REMOVED', objectId);
void db.$disconnect();
