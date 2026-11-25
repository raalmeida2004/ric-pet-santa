import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "../auth";

// Gift codes: the owner creates a code (e.g. "XMAS100") worth some credits
// and shares it. Any signed-in user can redeem it once.
export const giftCode = pgTable("gift_code", {
  id: text("id").primaryKey(),
  // Stored in UPPER CASE so "xmas100" and "XMAS100" are the same code.
  code: text("code").notNull().unique(),
  credits: integer("credits").notNull(),
  // How many different people may redeem it. NULL = no limit.
  maxUses: integer("maxUses"),
  usedCount: integer("usedCount").default(0).notNull(),
  // After this moment the code stops working. NULL = never expires.
  expiresAt: timestamp("expiresAt"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow(),
}).enableRLS();

// One row per person who redeemed a code. The unique index stops the same
// person from redeeming the same code twice.
export const giftCodeRedemption = pgTable(
  "gift_code_redemption",
  {
    id: text("id").primaryKey(),
    giftCodeId: text("giftCodeId")
      .notNull()
      .references(() => giftCode.id),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").defaultNow(),
  },
  (t) => [
    uniqueIndex("gift_code_redemption_code_user_idx").on(
      t.giftCodeId,
      t.userId,
    ),
  ],
).enableRLS();

export type GiftCodeType = typeof giftCode.$inferSelect;
