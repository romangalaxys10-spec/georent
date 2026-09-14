/** Compare DB top-newest objectIds with the live korter update_time_desc top-20. */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const dbTop = await db.listing.findMany({
    orderBy: { actualizeTime: 'desc' },
    take: 10,
    select: { objectId: true, actualizeTime: true },
  });
  console.log('DB top-10 by actualizeTime:');
  for (const r of dbTop) console.log(' ', r.objectId, r.actualizeTime.toISOString());
  console.log('897745 in DB:', (await db.listing.findUnique({ where: { objectId: 897745 } })) !== null);
  console.log('897730 in DB:', (await db.listing.findUnique({ where: { objectId: 897730 } })) !== null);
  console.log('total tracked:', await db.listing.count());

  const res = await fetch('https://korter.ge/pyapi/apartment/cards/sale?sort_geo_object_id=1&sort=update_time_desc&offset=0&limit=20', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(15000),
  });
  const json: any = await res.json();
  const ids = (json.data ?? []).map((x: any) => x.objectId ?? x.id);
  console.log('LIVE API top-20 objectIds:', ids.slice(0, 10).join(','), '...');
  console.log('897745 in live top-20:', ids.includes(897745));
  console.log('897730 in live top-20:', ids.includes(897730));
  void db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
