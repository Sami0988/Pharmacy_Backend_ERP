CREATE TYPE payment_method AS ENUM ('cash', 'credit', 'mobile_bank');

ALTER TABLE goods_receipts
  ADD COLUMN payment_method payment_method NOT NULL DEFAULT 'cash';
