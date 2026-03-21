/**
 * Encrypt existing SourceConnector configs to enc:v1: format.
 *
 * Run manually after deploy:
 *   ENCRYPTION_KEY=<hex> ENCRYPTION_SECRET=<secret> npx tsx scripts/encrypt-existing-configs.ts
 *
 * Requires both env vars:
 *   - ENCRYPTION_SECRET: to decrypt old-format configs
 *   - ENCRYPTION_KEY: to encrypt into new enc:v1: format
 */
import { PrismaClient } from "@prisma/client";
import { decrypt } from "../src/lib/encryption";
import { encryptConfig } from "../src/lib/config-encryption";

const prisma = new PrismaClient();

async function main() {
  const connectors = await prisma.sourceConnector.findMany({
    select: { id: true, config: true, provider: true },
  });

  let migrated = 0;
  let skipped = 0;
  let empty = 0;

  for (const connector of connectors) {
    if (!connector.config) {
      empty++;
      continue;
    }

    // Already in new format
    if (connector.config.startsWith("enc:v1:")) {
      skipped++;
      continue;
    }

    try {
      // Decrypt from old format (handles both encrypted and plain JSON)
      const decrypted = decrypt(connector.config);
      const parsed = JSON.parse(decrypted);

      // Re-encrypt with new format
      const encrypted = encryptConfig(parsed);

      await prisma.sourceConnector.update({
        where: { id: connector.id },
        data: { config: encrypted },
      });

      migrated++;
      console.log(`  ✓ ${connector.provider} (${connector.id})`);
    } catch (err) {
      console.error(
        `  ✗ ${connector.provider} (${connector.id}):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `\nDone: ${migrated} migrated, ${skipped} already encrypted, ${empty} empty`
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
