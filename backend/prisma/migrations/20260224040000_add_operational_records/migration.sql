-- CreateTable
CREATE TABLE "OperationalRecord" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "data" JSONB NOT NULL DEFAULT '{}',
    "farmId" TEXT,
    "plotId" TEXT,
    "cropId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalRecord_category_idx" ON "OperationalRecord"("category");
CREATE INDEX "OperationalRecord_subtype_idx" ON "OperationalRecord"("subtype");
CREATE INDEX "OperationalRecord_status_idx" ON "OperationalRecord"("status");
CREATE INDEX "OperationalRecord_eventAt_idx" ON "OperationalRecord"("eventAt");
CREATE INDEX "OperationalRecord_dueAt_idx" ON "OperationalRecord"("dueAt");
CREATE INDEX "OperationalRecord_farmId_idx" ON "OperationalRecord"("farmId");
CREATE INDEX "OperationalRecord_plotId_idx" ON "OperationalRecord"("plotId");
CREATE INDEX "OperationalRecord_cropId_idx" ON "OperationalRecord"("cropId");
CREATE INDEX "OperationalRecord_createdById_idx" ON "OperationalRecord"("createdById");

-- AddForeignKey
ALTER TABLE "OperationalRecord" ADD CONSTRAINT "OperationalRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalRecord" ADD CONSTRAINT "OperationalRecord_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalRecord" ADD CONSTRAINT "OperationalRecord_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalRecord" ADD CONSTRAINT "OperationalRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
