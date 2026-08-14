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
      update: {}, // ไม่ต้องอัปเดตอะไรถ้ามีข้อมูลอยู่แล้ว (idempotency)
      create: { name },
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
