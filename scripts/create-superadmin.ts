import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPERADMIN_EMAIL || "jonas@qorpera.com";
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!password) {
    console.error("SUPERADMIN_PASSWORD env var is required");
    process.exit(1);
  }

  // Check if superadmin already exists
  const existing = await prisma.user.findFirst({ where: { role: "superadmin" } });
  if (existing) {
    console.log(`Superadmin already exists: ${existing.email}`);
    return;
  }

  // Create Qorpera Admin operator
  const operator = await prisma.operator.create({
    data: {
      displayName: "Qorpera Admin",
      companyName: "Qorpera Admin",
    },
  });

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      operatorId: operator.id,
      email,
      name: "Jonas",
      passwordHash,
      role: "superadmin",
    },
  });

  console.log(`Superadmin created: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
