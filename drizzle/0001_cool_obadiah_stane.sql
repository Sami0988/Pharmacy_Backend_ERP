CREATE TYPE "public"."payment_due_date_type" AS ENUM('one_month', 'two_months', 'six_months', 'one_year', 'other');--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN "tax_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN "payment_due_date" date;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN "payment_due_date_type" "payment_due_date_type" DEFAULT 'one_month';--> statement-breakpoint
CREATE INDEX "idx_goods_receipts_payment_due_date" ON "goods_receipts" USING btree ("payment_due_date");