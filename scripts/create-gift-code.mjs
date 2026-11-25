/**
 * Create a gift code that people can redeem on the Billing page.
 *
 *   pnpm gift:create <CODE> <CREDITS> [MAX_USES] [EXPIRES]
 *
 * Examples:
 *   pnpm gift:create XMAS100 100            -> 100 credits, anyone, never expires
 *   pnpm gift:create FRIENDS 60 10          -> 60 credits, first 10 people only
 *   pnpm gift:create NEWYEAR 40 0 2027-01-31 -> 0 = no limit, stops after Jan 31
 *
 * Each person can redeem a given code only once.
 */
import { randomUUID } from "crypto";
import postgres from "postgres";

try {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local", quiet: true });
  dotenv.config({ quiet: true });
} catch {
  // dotenv is optional
}

const [rawCode, rawCredits, rawMaxUses, rawExpires] = process.argv.slice(2);

function usage(problem) {
  if (problem) console.error(`\n  Problem: ${problem}`);
  console.error(`
  Usage:   pnpm gift:create <CODE> <CREDITS> [MAX_USES] [EXPIRES]
  Example: pnpm gift:create XMAS100 100 50 2026-12-31

  CODE      letters, numbers, - or _ (case doesn't matter)
  CREDITS   credits each person gets (one portrait costs 20)
  MAX_USES  how many people can use it; 0 or leave out = no limit
  EXPIRES   last day it works, as YYYY-MM-DD; leave out = never expires
`);
  process.exit(1);
}

if (!rawCode || !rawCredits) usage();

const code = rawCode.trim().toUpperCase();
if (!/^[A-Z0-9_-]{3,64}$/.test(code)) {
  usage("CODE must be 3-64 letters, numbers, - or _.");
}

const credits = Number(rawCredits);
if (!Number.isInteger(credits) || credits <= 0) {
  usage("CREDITS must be a whole number above 0.");
}

let maxUses = null;
if (rawMaxUses !== undefined) {
  const n = Number(rawMaxUses);
  if (!Number.isInteger(n) || n < 0) usage("MAX_USES must be 0 or more.");
  maxUses = n === 0 ? null : n;
}

let expiresAt = null;
if (rawExpires !== undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawExpires)) {
    usage("EXPIRES must look like 2026-12-31.");
  }
  // Valid through the end of that day (UTC).
  expiresAt = new Date(`${rawExpires}T23:59:59.999Z`);
  if (Number.isNaN(expiresAt.getTime())) usage("EXPIRES is not a real date.");
  if (expiresAt.getTime() < Date.now()) {
    usage(`EXPIRES ${rawExpires} is already in the past.`);
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 15 });

try {
  await sql`
    insert into gift_code (id, code, credits, "maxUses", "expiresAt")
    values (${randomUUID()}, ${code}, ${credits}, ${maxUses}, ${expiresAt})
  `;
  console.log(`\n  ✅ Gift code created: ${code}`);
  console.log(`     Credits each:  ${credits}`);
  console.log(`     Max people:    ${maxUses ?? "no limit"}`);
  console.log(`     Expires:       ${rawExpires ?? "never"}`);
  console.log(`\n  Tell people to sign in, open the Billing page and enter ${code}.\n`);
} catch (error) {
  if (error?.code === "23505") {
    console.error(`A gift code called ${code} already exists. Pick another name.`);
  } else if (error?.code === "42P01") {
    console.error("The gift_code table doesn't exist yet. Run: pnpm db:push");
  } else {
    console.error("Could not create the gift code:", error);
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
