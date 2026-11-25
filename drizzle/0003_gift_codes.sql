-- Gift codes that users can redeem for free credits
CREATE TABLE "gift_code" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"credits" integer NOT NULL,
	"maxUses" integer,
	"usedCount" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp,
	"note" text,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "gift_code_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "gift_code" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gift_code_redemption" (
	"id" text PRIMARY KEY NOT NULL,
	"giftCodeId" text NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "gift_code_redemption" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gift_code_redemption" ADD CONSTRAINT "gift_code_redemption_giftCodeId_gift_code_id_fk" FOREIGN KEY ("giftCodeId") REFERENCES "public"."gift_code"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_code_redemption" ADD CONSTRAINT "gift_code_redemption_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_code_redemption_code_user_idx" ON "gift_code_redemption" USING btree ("giftCodeId","userId");
