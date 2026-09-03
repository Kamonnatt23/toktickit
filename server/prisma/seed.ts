import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const names = [
    "Account and Access",
    "Hardware",
    "Software",
    "Network",
  ];

  for (const name of names) {
    await prisma.category.upsert({
      where: { name },
      update: {}, 
      create: { name },
    });
  }

  // Lab 2 Seed Data: Development Requesters
  const requesters = [
    { name: "John Doe", email: "john@example.com", isActive: true },
    { name: "Alice Smith", email: "alice@example.com", isActive: true },
    { name: "Bob Jones", email: "bob@example.com", isActive: true },
    { name: "Charlie Brown", email: "charlie@example.com", isActive: true },
    { name: "Inactive User", email: "inactive@example.com", isActive: false },
  ];

  for (const req of requesters) {
    await prisma.requesterUser.upsert({
      where: { email: req.email },
      update: { isActive: req.isActive, name: req.name },
      create: {
        name: req.name,
        email: req.email,
        isActive: req.isActive,
        role: "Requester"
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
