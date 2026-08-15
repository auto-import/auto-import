const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS "VehicleCandidate_vehicleRequestId_vehicleId_key" ON "VehicleCandidate"("vehicleRequestId", "vehicleId");');
    console.log('✅ Unique index created successfully on VehicleCandidate(vehicleRequestId, vehicleId)');
  } catch (err) {
    console.error('❌ Error creating index:', err);
  } finally {
    await pool.end();
  }
}

run();
