-- CreateTable: products.batch_log (step-level logging for product sync batches)
CREATE TABLE "products"."batch_log" (
    "id" TEXT NOT NULL,
    "product_synced_batch_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "step" TEXT,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batch_log_product_synced_batch_id_idx" ON "products"."batch_log"("product_synced_batch_id");

-- AddForeignKey
ALTER TABLE "products"."batch_log" ADD CONSTRAINT "batch_log_product_synced_batch_id_fkey" FOREIGN KEY ("product_synced_batch_id") REFERENCES "products"."synced_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
