// Demo data tool for the Scratch & Win admin panel.
//
//   npm run seed:demo              dummy logo + prize images (where unset) and a
//                                  fresh set of 30 demo customers + their plays
//   npm run seed:demo -- --clear   remove all demo customers/plays (ids "demo-*")
//   npm run seed:demo -- --sql     write php-backend/demo-data.sql and
//                                  deploy/demo-data.sql for the PHP/cPanel backend
//
// Uses the same DB_* settings as the server (backend/.env).
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getPool, initDb, query } from "../src/mysql.js";
import { applyDemoArtwork, clearDemoData, demoDataSql, seedDemoData } from "../src/demo.js";

const args = new Set(process.argv.slice(2));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Default prizes/coupons from schema.sql — used for the offline SQL export.
const DEFAULT_SEGMENTS = [
  { id: "s1", label: "Free Coffee", weight: 28, couponId: "c-coffee" },
  { id: "s2", label: "10% Off", weight: 18, couponId: "c-10" },
  { id: "s3", label: "Try Again", weight: 8, couponId: null },
  { id: "s4", label: "Free Cookie", weight: 20, couponId: "c-cookie" },
  { id: "s5", label: "20% Off", weight: 12, couponId: "c-20" },
  { id: "s6", label: "Buy 1 Get 1", weight: 14, couponId: "c-bogo" },
];
const DEFAULT_COUPONS = [
  ["c-coffee", "Free Coffee", "Any regular coffee"],
  ["c-10", "10% Off", "Entire bill"],
  ["c-cookie", "Free Cookie", "Choc-chip cookie"],
  ["c-20", "20% Off", "Entire bill"],
  ["c-bogo", "Buy 1 Get 1", "Any beverage"],
].map(([id, title, product]) => ({ id, title, product, codePrefix: "CCB", validityDays: 14 }));

if (args.has("--sql")) {
  const sql = demoDataSql({ segments: DEFAULT_SEGMENTS, coupons: DEFAULT_COUPONS });
  for (const rel of ["php-backend/demo-data.sql", "deploy/demo-data.sql"]) {
    writeFileSync(path.join(root, rel), sql);
    console.log(`Wrote ${rel}`);
  }
  process.exit(0);
}

try {
  await initDb();
  if (args.has("--clear")) {
    await clearDemoData(query);
    console.log("Removed all demo customers and plays.");
  } else {
    await applyDemoArtwork(query);
    const { users, spins } = await seedDemoData(query);
    console.log(`Demo logo + prize images applied; seeded ${users} customers and ${spins} plays.`);
  }
} catch (e) {
  console.error("✖ Demo seed failed:", e.message);
  process.exitCode = 1;
} finally {
  await getPool().end();
}
