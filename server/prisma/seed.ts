import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const categories = [
    "Account and Access",
    "Hardware",
    "Software",
    "Network",
  ];

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {}, 
      create: { name },
    });
  }

  const systems = [
    "ERP",
    "CRM",
    "HRIS",
    "Email",
    "VPN",
  ];
  for (const name of systems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {}, 
      create: { name },
    });
  }

  // Users
  const users = [
    // Requesters (4 active, 1 inactive)
    { name: "John Doe", email: "john@example.com", role: "Requester", isActive: true },
    { name: "Alice Smith", email: "alice@example.com", role: "Requester", isActive: true },
    { name: "Bob Jones", email: "bob@example.com", role: "Requester", isActive: true },
    { name: "Charlie Brown", email: "charlie@example.com", role: "Requester", isActive: true },
    { name: "Inactive Requester", email: "inactive.req@example.com", role: "Requester", isActive: false },
    // IT Staff (3 active, 1 inactive)
    { name: "Staff One", email: "staff1@example.com", role: "IT Staff", isActive: true },
    { name: "Staff Two", email: "staff2@example.com", role: "IT Staff", isActive: true },
    { name: "Staff Three", email: "staff3@example.com", role: "IT Staff", isActive: true },
    { name: "Inactive Staff", email: "inactive.staff@example.com", role: "IT Staff", isActive: false },
    // Administrator (1 active)
    { name: "Admin User", email: "admin@example.com", role: "Administrator", isActive: true },
  ];

  const createdUsers = [];
  for (const user of users) {
    const u = await prisma.user.upsert({
      where: { email: user.email },
      update: { 
        isActive: user.isActive, 
        name: user.name, 
        role: user.role,
        passwordHash: passwordHash
      },
      create: {
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        role: user.role,
        passwordHash: passwordHash
      },
    });
    createdUsers.push(u);
  }

  // Get specific users for creating tickets
  const requester1 = createdUsers.find(u => u.email === "john@example.com")!;
  const requester2 = createdUsers.find(u => u.email === "alice@example.com")!;
  const staff1 = createdUsers.find(u => u.email === "staff1@example.com")!;
  const staff2 = createdUsers.find(u => u.email === "staff2@example.com")!;

  const catHardware = await prisma.category.findUnique({ where: { name: "Hardware" } });
  const catSoftware = await prisma.category.findUnique({ where: { name: "Software" } });
  
  const sysEmail = await prisma.relatedSystem.findUnique({ where: { name: "Email" } });
  const sysVPN = await prisma.relatedSystem.findUnique({ where: { name: "VPN" } });

  if (catHardware && catSoftware && sysEmail && sysVPN) {
    // Ticket 1: New, unassigned
    let t1 = await prisma.ticket.findFirst({ where: { summary: "Cannot access email" } });
    if (!t1) {
      t1 = await prisma.ticket.create({
        data: {
          categoryId: catHardware.id,
          relatedSystemId: sysEmail.id,
          summary: "Cannot access email",
          priority: "High",
          itPriority: "High",
          description: "My email is not loading on my new laptop.",
          status: "New",
          requesterId: requester1.id,
          attachments: {
            create: [
              {
                fileName: "screenshot.png",
                fileType: "image/png",
                fileSize: 1024,
                filePath: "/uploads/screenshot.png"
              }
            ]
          }
        }
      });
    }

    // Ticket 2: In Progress, assigned
    let t2 = await prisma.ticket.findFirst({ where: { summary: "VPN drops connection" } });
    if (!t2) {
      t2 = await prisma.ticket.create({
        data: {
          categoryId: catSoftware.id,
          relatedSystemId: sysVPN.id,
          summary: "VPN drops connection",
          priority: "Medium",
          itPriority: "Medium",
          description: "VPN keeps disconnecting every 5 minutes.",
          status: "In Progress",
          requesterId: requester2.id,
          ownerId: staff1.id
        }
      });

      // Add comments to Ticket 2 only when created
      await prisma.publicComment.create({
        data: {
          content: "Can you provide the exact error message?",
          ticketId: t2.id,
          authorId: staff1.id
        }
      });

      await prisma.publicComment.create({
        data: {
          content: "It says 'Connection reset by peer'.",
          ticketId: t2.id,
          authorId: requester2.id
        }
      });

      await prisma.internalNote.create({
        data: {
          content: "Checked the logs, looks like a firewall issue on our end.",
          ticketId: t2.id,
          authorId: staff1.id
        }
      });
    }

    // Ticket 3: Resolved, assigned
    let t3 = await prisma.ticket.findFirst({ where: { summary: "Mouse is broken" } });
    if (!t3) {
      await prisma.ticket.create({
        data: {
          categoryId: catHardware.id,
          relatedSystemId: sysEmail.id,
          summary: "Mouse is broken",
          priority: "Low",
          itPriority: "Low",
          description: "The scroll wheel is stuck.",
          status: "Resolved",
          requesterId: requester1.id,
          ownerId: staff2.id,
          publicComments: {
            create: [
              { content: "A replacement mouse is ready at the IT desk.", authorId: staff2.id }
            ]
          }
        }
      });
    }
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
