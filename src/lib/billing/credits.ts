import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import {
  creditTransaction,
  giftCode,
  giftCodeRedemption,
  payment,
} from "@/db/schema/billing";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
  }
}

export type GiftCodeErrorReason =
  | "invalid"
  | "expired"
  | "used_up"
  | "already_redeemed";

const GIFT_CODE_MESSAGES: Record<GiftCodeErrorReason, string> = {
  invalid: "That gift code doesn't exist.",
  expired: "That gift code has expired.",
  used_up: "That gift code has already been used up.",
  already_redeemed: "You've already used this gift code.",
};

export class GiftCodeError extends Error {
  constructor(public reason: GiftCodeErrorReason) {
    super(GIFT_CODE_MESSAGES[reason]);
    this.name = "GiftCodeError";
  }
}

/** Gift codes are case-insensitive and ignore surrounding spaces. */
export function normalizeGiftCode(code: string): string {
  return code.trim().toUpperCase();
}

interface RecordPaymentInput {
  userId: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string | null;
  amount: number;
  currency: string;
  credits: number;
}

interface ConsumeCreditsOptions {
  description?: string;
  generationTaskId?: string;
}

/**
 * Records a completed Stripe payment and tops up the user's credits.
 * Idempotent on `stripeSessionId`, so retried webhooks won't double-credit.
 * Returns the new balance, or `null` when the payment was already processed.
 */
export async function recordPaymentAndGrantCredits(
  input: RecordPaymentInput,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(eq(payment.stripeSessionId, input.stripeSessionId))
      .limit(1);

    if (existing.length > 0) {
      return null;
    }

    const paymentId = randomUUID();
    await tx.insert(payment).values({
      id: paymentId,
      userId: input.userId,
      stripeSessionId: input.stripeSessionId,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      amount: input.amount,
      currency: input.currency,
      credits: input.credits,
      status: "completed",
    });

    const [updated] = await tx
      .update(user)
      .set({ credits: sql`${user.credits} + ${input.credits}` })
      .where(eq(user.id, input.userId))
      .returning({ credits: user.credits });

    await tx.insert(creditTransaction).values({
      id: randomUUID(),
      userId: input.userId,
      type: "recharge",
      amount: input.credits,
      balanceAfter: updated.credits,
      description: "Stripe purchase",
      paymentId,
    });

    return updated.credits;
  });
}

/**
 * Atomically consumes credits. Throws `InsufficientCreditsError` when the
 * balance is too low. Returns the remaining balance.
 */
export async function consumeCredits(
  userId: string,
  cost: number,
  options: ConsumeCreditsOptions = {},
): Promise<number> {
  const { description = "Portrait generation", generationTaskId } = options;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(user)
      .set({ credits: sql`${user.credits} - ${cost}` })
      .where(sql`${user.id} = ${userId} AND ${user.credits} >= ${cost}`)
      .returning({ credits: user.credits });

    if (!updated) {
      throw new InsufficientCreditsError();
    }

    const transactionId = randomUUID();
    await tx.insert(creditTransaction).values({
      id: transactionId,
      userId,
      type: "usage",
      amount: -cost,
      balanceAfter: updated.credits,
      description,
      generationTaskId,
    });

    return updated.credits;
  });
}

/**
 * Returns whether the user has enough credits for a generation.
 */
export async function hasEnoughCredits(
  userId: string,
  cost: number,
): Promise<boolean> {
  const [account] = await db
    .select({ credits: user.credits })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return (account?.credits ?? 0) >= cost;
}

/**
 * Redeems a gift code for a user and adds its credits to their balance.
 * Throws `GiftCodeError` when the code can't be used. Returns the credits
 * granted and the new balance.
 */
export async function redeemGiftCode(
  userId: string,
  rawCode: string,
): Promise<{ credits: number; balance: number }> {
  const code = normalizeGiftCode(rawCode);
  if (!code) throw new GiftCodeError("invalid");

  return db.transaction(async (tx) => {
    // Lock the code row so two people redeeming at the same moment can't
    // both squeeze past the maxUses limit.
    const [gift] = await tx
      .select()
      .from(giftCode)
      .where(eq(giftCode.code, code))
      .limit(1)
      .for("update");

    if (!gift) throw new GiftCodeError("invalid");
    if (gift.expiresAt && gift.expiresAt.getTime() <= Date.now()) {
      throw new GiftCodeError("expired");
    }
    if (gift.maxUses !== null && gift.usedCount >= gift.maxUses) {
      throw new GiftCodeError("used_up");
    }

    // The unique (giftCodeId, userId) index makes this a no-op on a repeat.
    const inserted = await tx
      .insert(giftCodeRedemption)
      .values({ id: randomUUID(), giftCodeId: gift.id, userId })
      .onConflictDoNothing()
      .returning({ id: giftCodeRedemption.id });

    if (inserted.length === 0) throw new GiftCodeError("already_redeemed");

    await tx
      .update(giftCode)
      .set({ usedCount: sql`${giftCode.usedCount} + 1` })
      .where(eq(giftCode.id, gift.id));

    const [updated] = await tx
      .update(user)
      .set({ credits: sql`${user.credits} + ${gift.credits}` })
      .where(eq(user.id, userId))
      .returning({ credits: user.credits });

    await tx.insert(creditTransaction).values({
      id: randomUUID(),
      userId,
      type: "gift",
      amount: gift.credits,
      balanceAfter: updated.credits,
      description: `Gift code ${gift.code}`,
    });

    return { credits: gift.credits, balance: updated.credits };
  });
}
