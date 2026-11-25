import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/get-session";
import { GiftCodeError, redeemGiftCode } from "@/lib/billing/credits";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getServerSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a gift code." }, { status: 400 });
  }

  try {
    const result = await redeemGiftCode(session.user.id, parsed.data.code);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GiftCodeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[redeem] failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
