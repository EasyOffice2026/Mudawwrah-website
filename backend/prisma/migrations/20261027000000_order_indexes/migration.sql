-- Indexes for the order queries that grow with every order: lists, reports and date filters (tenant + date),
-- the waiting alarm (tenant + status + date), the daily closing (tenant + paid time) and customer history.
CREATE INDEX "Order_tenantId_createdAt_idx" ON "Order"("tenantId", "createdAt");
CREATE INDEX "Order_tenantId_status_createdAt_idx" ON "Order"("tenantId", "status", "createdAt");
CREATE INDEX "Order_tenantId_paidAt_idx" ON "Order"("tenantId", "paidAt");
CREATE INDEX "Order_tenantId_customerPhone_idx" ON "Order"("tenantId", "customerPhone");
