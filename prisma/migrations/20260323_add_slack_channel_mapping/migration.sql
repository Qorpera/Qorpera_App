-- Slack channel to department mapping
CREATE TABLE "SlackChannelMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackChannelMapping_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SlackChannelMapping_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "SourceConnector"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SlackChannelMapping_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SlackChannelMapping_connectorId_channelId_key" ON "SlackChannelMapping"("connectorId", "channelId");
CREATE INDEX "SlackChannelMapping_operatorId_idx" ON "SlackChannelMapping"("operatorId");
CREATE INDEX "SlackChannelMapping_connectorId_idx" ON "SlackChannelMapping"("connectorId");
