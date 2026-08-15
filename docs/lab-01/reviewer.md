# Lab 1 — Peer Review Record  (fill this in)

**Author:** กมนนัทธ์ สีทาไข — 67070501001 — GitHub: @Kamonnatt23
**Peer reviewer:** เบญญาภา รัตนคุโณดม — 67070501030 — GitHub: @Piink7878

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
| PR #1 | feature/1-project-foundation | Approved |
| PR #2 | feature/2-health-check | Approved |
| PR #3 | feature/3-category-seed | Changes Requested |
| PR #4 | feature/4-category-list | Approved |

Reviewer comment I received: "สิ่งที่เกิดขึ้นคือใน Pull Request ของคุณมีการสร้างไฟล์ Migration (ไฟล์ SQL) ขึ้นมาแล้ว แต่ยังขาดองค์ประกอบสำคัญอีก 2 ส่วน... 1. อัปเดตไฟล์ schema.prisma 2. สร้างไฟล์สคริปต์สำหรับ Data Seed"
How I responded: I used AI to update `schema.prisma` and implemented the `seed.ts` script using PrismaClient's `upsert`, then pushed the new commit to `feature/3-category-seed`.

## Pull Requests I reviewed for my partner
My comment: "You forgot to make the seed script idempotent. It currently inserts duplicates if run twice."
Partner's response: "Thank you, I updated the seed script to use Prisma's `upsert` command instead of `create`."
