ALTER TABLE "batches" ADD COLUMN "selling_price" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "selling_price";