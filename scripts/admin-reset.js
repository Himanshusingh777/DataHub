/**
 * Admin Reset Script
 * ------------------
 * Run from your project root:
 *   node scripts/admin-reset.js
 *
 * This will:
 *  1. Show all registered users in the DB
 *  2. Reset the admin password to: Admin@1234  (change it after login)
 */

const path    = require("path");
const fs      = require("fs");
const crypto  = require("crypto");

// ── Load DB ──────────────────────────────────────────────────────────────────
let Database;
try {
  Database = require("better-sqlite3");
} catch {
  console.error('\n❌  better-sqlite3 not installed. Run:  npm install better-sqlite3\n');
  process.exit(1);
}

const dbPath = path.join(process.cwd(), ".crosstecch", "crosstecch.db");
if (!fs.existsSync(dbPath)) {
  console.error(`\n❌  Database not found at: ${dbPath}`);
  console.error("    Start the app at least once so the DB is created, then re-run this script.\n");
  process.exit(1);
}

const db = new Database(dbPath);

// ── Show all users ────────────────────────────────────────────────────────────
const users = db.prepare(
  "SELECT id, email, name, role, status, datetime(created_at/1000,'unixepoch') as joined FROM users"
).all();

console.log("\n════════════════════════════════════════");
console.log("  CrossTecch — Registered Users");
console.log("════════════════════════════════════════");

if (users.length === 0) {
  console.log("  ⚠️  No users found. Register via the app first.");
} else {
  users.forEach((u, i) => {
    console.log(`\n  ${i + 1}. ${u.email}`);
    console.log(`     Name  : ${u.name ?? "(no name)"}`);
    console.log(`     Role  : ${u.role}`);
    console.log(`     Status: ${u.status}`);
    console.log(`     Joined: ${u.joined}`);
    console.log(`     ID    : ${u.id}`);
  });
}

// ── Reset admin password ──────────────────────────────────────────────────────
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL || "singhhimanshu3306@gmail.com";
const NEW_PASSWORD  = "Admin@1234";  // ← change this if you want a different reset password

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}.${hash.toString("hex")}`;
}

const adminUser = db.prepare("SELECT id, email FROM users WHERE email = ?").get(ADMIN_EMAIL.toLowerCase());

console.log("\n════════════════════════════════════════");

if (!adminUser) {
  console.log(`\n  ⚠️  Admin user (${ADMIN_EMAIL}) not found in DB.`);
  console.log("  → Go to the app and Register with this email first, then re-run this script.\n");
} else {
  db.prepare("UPDATE users SET pass_hash = ?, role = ?, status = ? WHERE id = ?")
    .run(hashPassword(NEW_PASSWORD), "admin", "active", adminUser.id);

  // Invalidate old sessions
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(adminUser.id);

  console.log(`\n  ✅  Password reset successful!\n`);
  console.log(`  Email    : ${adminUser.email}`);
  console.log(`  Password : ${NEW_PASSWORD}`);
  console.log("\n  ⚠️  Change your password after logging in (Settings → Security).");
  console.log("\n════════════════════════════════════════\n");
}
