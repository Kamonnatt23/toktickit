import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  let defaultPasswordHash: string | null = null;

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
    // Requesters (4 active, 1 inactive, 1 empty active)
    { name: "John Doe", email: "john@example.com", role: "Requester", isActive: true },
    { name: "Alice Smith", email: "alice@example.com", role: "Requester", isActive: true },
    { name: "Bob Jones", email: "bob@example.com", role: "Requester", isActive: true },
    { name: "Charlie Brown", email: "charlie@example.com", role: "Requester", isActive: true },
    { name: "Empty Requester", email: "empty.req@example.com", role: "Requester", isActive: true },
    { name: "Inactive Requester", email: "inactive.req@example.com", role: "Requester", isActive: false },
    // IT Staff (3 active, 1 inactive)
    { name: "Staff One", email: "staff1@example.com", role: "IT Staff", isActive: true },
    { name: "Staff Two", email: "staff2@example.com", role: "IT Staff", isActive: true },
    { name: "Staff Three", email: "staff3@example.com", role: "IT Staff", isActive: true },
    { name: "Inactive Staff", email: "inactive.staff@example.com", role: "IT Staff", isActive: false },
    // Administrator (1 active)
    { name: "Admin User", email: "admin@example.com", role: "Administrator", isActive: true },
  ];

  const createdUsers: any[] = [];
  for (const user of users) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      createdUsers.push(existing);
      continue;
    }

    if (!defaultPasswordHash) {
      defaultPasswordHash = await bcrypt.hash('password123', 10);
    }

    const u = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        role: user.role,
        passwordHash: defaultPasswordHash
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
  const catAccount = await prisma.category.findUnique({ where: { name: "Account and Access" } });
  const catNetwork = await prisma.category.findUnique({ where: { name: "Network" } });
  
  const sysEmail = await prisma.relatedSystem.findUnique({ where: { name: "Email" } });
  const sysVPN = await prisma.relatedSystem.findUnique({ where: { name: "VPN" } });
  const sysHRIS = await prisma.relatedSystem.findUnique({ where: { name: "HRIS" } });
  const sysERP = await prisma.relatedSystem.findUnique({ where: { name: "ERP" } });

  if (catHardware && catSoftware && catAccount && catNetwork && sysEmail && sysVPN && sysHRIS && sysERP) {
    // Ticket 1: New, unassigned (0 actions)
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
          ownerId: null,
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

    // Ticket 2: In Progress, assigned to staff1, 0 actions (to test Resolution Gate refusal)
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

    // Ticket 3: Resolved (Legacy, resolvedAt = null), assigned to staff2
    let t3 = await prisma.ticket.findFirst({ where: { summary: "Mouse is broken" } });
    if (!t3) {
      t3 = await prisma.ticket.create({
        data: {
          categoryId: catHardware.id,
          relatedSystemId: sysEmail.id,
          summary: "Mouse is broken",
          priority: "Low",
          itPriority: "Low",
          description: "The scroll wheel is stuck.",
          status: "Resolved",
          resolvedAt: null,
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

    // Ticket 4: Open, assigned to staff1
    let t4 = await prisma.ticket.findFirst({ where: { summary: "Need secondary monitor" } });
    if (!t4) {
      t4 = await prisma.ticket.create({
        data: {
          categoryId: catHardware.id,
          relatedSystemId: sysERP.id,
          summary: "Need secondary monitor",
          priority: "Low",
          itPriority: "Low",
          description: "Requesting a second 24-inch monitor for spreadsheet analysis.",
          status: "Open",
          requesterId: requester1.id,
          ownerId: staff1.id
        }
      });
    }

    // Ticket 5: In Progress, assigned to staff2, with 3+ Actions Taken by multiple staff members (Staff 1 and Staff 2)
    let t5 = await prisma.ticket.findFirst({ where: { summary: "Database slow queries" } });
    if (!t5) {
      t5 = await prisma.ticket.create({
        data: {
          categoryId: catSoftware.id,
          relatedSystemId: sysERP.id,
          summary: "Database slow queries",
          priority: "Critical",
          itPriority: "Critical",
          description: "Reports are timing out during month-end financial close.",
          status: "In Progress",
          requesterId: requester1.id,
          ownerId: staff2.id
        }
      });
    }

    // Seed Actions Taken for Ticket 5 idempotently
    if (t5) {
      const a1Desc = "Analyzed PostgreSQL slow query logs and identified missing index on ticketId.";
      let a1 = await prisma.actionTaken.findFirst({ where: { ticketId: t5.id, actionDescription: a1Desc } });
      if (!a1) {
        await prisma.actionTaken.create({
          data: {
            ticketId: t5.id,
            actionDateTime: new Date(Date.now() - 3 * 3600000),
            actionDescription: a1Desc,
            result: "Query plan showed sequential scan taking 1200ms.",
            performedById: staff1.id,
            followUpRequired: true,
            followUpNote: "Benchmark query latency after index rollout.",
            attachmentNotes: "explain_analyze_before.txt"
          }
        });
      }

      const a2Desc = "Created composite index on ActionTakenRevision (actionTakenId, editedAt).";
      let a2 = await prisma.actionTaken.findFirst({ where: { ticketId: t5.id, actionDescription: a2Desc } });
      if (!a2) {
        await prisma.actionTaken.create({
          data: {
            ticketId: t5.id,
            actionDateTime: new Date(Date.now() - 2 * 3600000),
            actionDescription: a2Desc,
            result: "Index created concurrently without table lock.",
            performedById: staff2.id,
            followUpRequired: false,
            followUpNote: null,
            attachmentNotes: null
          }
        });
      }

      const a3Desc = "Re-ran benchmark suite after index creation.";
      let a3 = await prisma.actionTaken.findFirst({ where: { ticketId: t5.id, actionDescription: a3Desc } });
      if (!a3) {
        await prisma.actionTaken.create({
          data: {
            ticketId: t5.id,
            actionDateTime: new Date(Date.now() - 1 * 3600000),
            actionDescription: a3Desc,
            result: "Index scan executed in 4ms, reducing query time by 99%.",
            performedById: staff1.id,
            followUpRequired: false,
            followUpNote: null,
            attachmentNotes: "benchmark_results_after.txt"
          }
        });
      }
    }

    // Ticket 6: Waiting for Requester, assigned to staff1
    let t6 = await prisma.ticket.findFirst({ where: { summary: "Password reset for HRIS" } });
    if (!t6) {
      t6 = await prisma.ticket.create({
        data: {
          categoryId: catAccount.id,
          relatedSystemId: sysHRIS.id,
          summary: "Password reset for HRIS",
          priority: "Medium",
          itPriority: "Medium",
          description: "Locked out after three failed attempts.",
          status: "Waiting for Requester",
          requesterId: requester1.id,
          ownerId: staff1.id,
          publicComments: {
            create: [
              { content: "Temporary password sent via SMS. Please confirm once you log in.", authorId: staff1.id }
            ]
          }
        }
      });
    }

    // Ticket 7: Resolved within last 30 days (10 days ago), assigned to staff1, exactly 1 Action Taken
    let t7 = await prisma.ticket.findFirst({ where: { summary: "Keyboard replacement" } });
    if (!t7) {
      t7 = await prisma.ticket.create({
        data: {
          categoryId: catHardware.id,
          relatedSystemId: sysEmail.id,
          summary: "Keyboard replacement",
          priority: "Medium",
          itPriority: "Medium",
          description: "Spacebar is sticking on external keyboard.",
          status: "Resolved",
          resolvedAt: new Date(Date.now() - 10 * 24 * 3600000),
          requesterId: requester2.id,
          ownerId: staff1.id
        }
      });
    }

    if (t7) {
      const a7Desc = "Supplied replacement USB keyboard from inventory.";
      let a7 = await prisma.actionTaken.findFirst({ where: { ticketId: t7.id, actionDescription: a7Desc } });
      if (!a7) {
        await prisma.actionTaken.create({
          data: {
            ticketId: t7.id,
            actionDateTime: new Date(Date.now() - 10 * 24 * 3600000),
            actionDescription: a7Desc,
            result: "Keyboard tested working; keys responsive.",
            performedById: staff1.id,
            followUpRequired: false,
            followUpNote: null,
            attachmentNotes: "Hardware asset tag #KB-8821"
          }
        });
      }
    }

    // Ticket 8: Resolved older than 30 days (45 days ago), assigned to staff2, with 1 Action Taken
    let t8 = await prisma.ticket.findFirst({ where: { summary: "Outlook profile corrupted" } });
    if (!t8) {
      t8 = await prisma.ticket.create({
        data: {
          categoryId: catSoftware.id,
          relatedSystemId: sysEmail.id,
          summary: "Outlook profile corrupted",
          priority: "High",
          itPriority: "High",
          description: "Outlook crashes immediately on launch.",
          status: "Resolved",
          resolvedAt: new Date(Date.now() - 45 * 24 * 3600000),
          requesterId: requester1.id,
          ownerId: staff2.id
        }
      });
    }

    if (t8) {
      const a8Desc = "Rebuilt Outlook local cache and re-authenticated user profile.";
      let a8 = await prisma.actionTaken.findFirst({ where: { ticketId: t8.id, actionDescription: a8Desc } });
      if (!a8) {
        await prisma.actionTaken.create({
          data: {
            ticketId: t8.id,
            actionDateTime: new Date(Date.now() - 45 * 24 * 3600000),
            actionDescription: a8Desc,
            result: "Profile synced successfully and emails loaded.",
            performedById: staff2.id,
            followUpRequired: false,
            followUpNote: null
          }
        });
      }
    }

    // Ticket 9: Closed, assigned to staff1
    let t9 = await prisma.ticket.findFirst({ where: { summary: "Upgrade RAM on workstation" } });
    if (!t9) {
      t9 = await prisma.ticket.create({
        data: {
          categoryId: catHardware.id,
          relatedSystemId: sysERP.id,
          summary: "Upgrade RAM on workstation",
          priority: "Low",
          itPriority: "Low",
          description: "Requested 16GB upgrade for running local Docker containers.",
          status: "Closed",
          resolvedAt: new Date(Date.now() - 60 * 24 * 3600000),
          requesterId: requester1.id,
          ownerId: staff1.id
        }
      });
    }

    // Ticket 10: Reopened, unassigned (ownerId = null) - Active unassigned queue card
    let t10 = await prisma.ticket.findFirst({ where: { summary: "Printer offline in Room 204" } });
    if (!t10) {
      t10 = await prisma.ticket.create({
        data: {
          categoryId: catHardware.id,
          relatedSystemId: sysVPN.id,
          summary: "Printer offline in Room 204",
          priority: "High",
          itPriority: "High",
          description: "Printer went offline again after reboot.",
          status: "Reopened",
          resolvedAt: null,
          requesterId: requester2.id,
          ownerId: null,
          internalNotes: {
            create: [
              { content: "Ticket reopened because paper feed roller failed again.", authorId: staff1.id }
            ]
          }
        }
      });
    }

    // Ticket 11: Cancelled, assigned to staff1
    let t11 = await prisma.ticket.findFirst({ where: { summary: "Duplicate request for monitor" } });
    if (!t11) {
      t11 = await prisma.ticket.create({
        data: {
          categoryId: catHardware.id,
          relatedSystemId: sysERP.id,
          summary: "Duplicate request for monitor",
          priority: "Low",
          itPriority: "Low",
          description: "Accidentally submitted twice.",
          status: "Cancelled",
          requesterId: requester1.id,
          ownerId: staff1.id,
          internalNotes: {
            create: [
              { content: "Cancelled as duplicate of ticket #4.", authorId: staff1.id }
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
