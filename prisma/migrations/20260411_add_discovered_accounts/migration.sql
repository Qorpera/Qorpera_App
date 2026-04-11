-- Discovered accounts: tracks tenant users found via delegation, with approval workflow

CREATE TABLE "DiscoveredAccount" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "title" TEXT,
    "department" TEXT,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "exclusionReason" TEXT,
    "connectorId" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "DiscoveredAccount_pkey" PRIMARY KEY ("id")
);

-- One account per email per operator
CREATE UNIQUE INDEX "DiscoveredAccount_operatorId_email_key" ON "DiscoveredAccount"("operatorId", "email");

-- One-to-one with SourceConnector
CREATE UNIQUE INDEX "DiscoveredAccount_connectorId_key" ON "DiscoveredAccount"("connectorId");

-- Query by status
CREATE INDEX "DiscoveredAccount_operatorId_status_idx" ON "DiscoveredAccount"("operatorId", "status");

-- Foreign keys
ALTER TABLE "DiscoveredAccount" ADD CONSTRAINT "DiscoveredAccount_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveredAccount" ADD CONSTRAINT "DiscoveredAccount_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "SourceConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
