import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const PRICING = {
  "gpt-5.4": { input: 2.50, output: 15.00 },
  "gpt-5.4-mini": { input: 0.75, output: 4.50 },
  "gpt-5.4-nano": { input: 0.20, output: 1.25 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-2024-11-20": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4.1": { input: 2.00, output: 8.00 },
  "gpt-4.1-mini": { input: 0.40, output: 1.60 },
  "gpt-4.1-nano": { input: 0.10, output: 0.40 },
  "o3-mini": { input: 1.10, output: 4.40 },
  "claude-opus-4-6": { input: 5.00, output: 25.00 },
  "claude-sonnet-4-6-20260218": { input: 3.00, output: 15.00 },
  "claude-sonnet-4-20250514": { input: 3.00, output: 15.00 },
  "claude-haiku-4-5-20251001": { input: 1.00, output: 5.00 },
  "claude-haiku-3-5-20241022": { input: 0.80, output: 4.00 },
};

async function main() {
  const existing = await prisma.appSetting.findFirst({
    where: { key: "modelPricing", operatorId: null },
  });

  if (existing) {
    await prisma.appSetting.update({
      where: { id: existing.id },
      data: { value: JSON.stringify(PRICING), lastModifiedAt: new Date() },
    });
    console.log("Model pricing updated.");
  } else {
    await prisma.appSetting.create({
      data: { key: "modelPricing", value: JSON.stringify(PRICING) },
    });
    console.log("Model pricing created.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => { console.error(err); prisma.$disconnect(); process.exit(1); });
