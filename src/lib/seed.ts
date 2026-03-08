import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding QorperaAPP database...");

  // Create default operator
  const operator = await prisma.operator.upsert({
    where: { id: "default-operator" },
    create: { id: "default-operator", displayName: "Operator", email: "operator@qorpera.local" },
    update: {},
  });
  console.log(`Operator: ${operator.id}`);

  // Default app settings
  const defaults: [string, string][] = [
    ["ai_provider", "ollama"],
    ["ollama_base_url", "http://localhost:11434"],
    ["ollama_model", "llama3.2"],
    ["setup_completed", "false"],
  ];
  for (const [key, value] of defaults) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }

  console.log("Seed complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
