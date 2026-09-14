const { Client } = require('pg');
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL);
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  !url.pathname.startsWith('/codex_dossier_fix_')
)
  throw new Error('Disposable local database required');
const samples = [
  [' GRIS ', 'GRAY'],
  ['ARGENTÉ', 'SILVER'],
  ['doré', 'GOLD'],
  ['black', 'BLACK'],
  ['Bleu nuit métallisé', 'OTHER'],
  ['', null],
  [null, null],
];
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    if (process.argv[2] === 'seed') {
      await db.query(
        `INSERT INTO "Organization"(id,name,type,"updatedAt") VALUES('section3-color-migration','Paint migration','test',now()) ON CONFLICT DO NOTHING`,
      );
      for (const [i, [value]] of samples.entries()) {
        await db.query(
          `INSERT INTO "Vehicle"(id,"organizationId",brand,model,"acquisitionType","updatedAt") VALUES($1,'section3-color-migration','Test','Color','stock',now()) ON CONFLICT DO NOTHING`,
          [`section3-color-${i}`],
        );
        await db.query(
          `INSERT INTO "VehicleSpec"(id,"vehicleId",color) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
          [`section3-spec-${i}`, `section3-color-${i}`, value],
        );
      }
      console.log('7 historical fixtures created before migration');
    } else {
      const rows = (
        await db.query(
          `SELECT v.id,v.color,v."paintCondition",s.color AS legacy FROM "Vehicle" v JOIN "VehicleSpec" s ON s."vehicleId"=v.id WHERE v."organizationId"='section3-color-migration' ORDER BY v.id`,
        )
      ).rows;
      assert.equal(rows.length, samples.length);
      rows.forEach((row, i) =>
        assert.deepEqual(
          [row.color, row.paintCondition, row.legacy],
          [samples[i][1], 'UNKNOWN', samples[i][0]],
        ),
      );
      console.log(
        '7 migration fixtures verified: mapping, UNKNOWN paint, original text preserved',
      );
    }
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
