# Lab 1 — Peer Review Record 

**Author:** กมนนัทธ์ สีทาไข — 67070501001 — GitHub: @Kamonnatt23

**Peer reviewer:** เบญญาภา รัตนคุโณดม — 67070501030 — GitHub: @Piink7878

## Pull Requests I authored (reviewed by my partner)
| PR | Reviewer | Decusion | comment | My respons |  Evidence |
|----|--------|------------------|
| PR #5 chore: set up project foundation and tech stack
 | Piink7878 | Approved | 1. แก้ README encoding
ตรวจสอบไฟล์ README.md
ตอนนี้มีตัวอักษรแปลก ๆ / encoding ผิดปกติ เช่น ��
แก้ให้ README แสดงผลเป็น Markdown ปกติ และไม่มีข้อความที่เพี้ยน
2. แก้คำใน README
ถ้าไม่ได้ใช้ npm workspace จริง ให้เปลี่ยนคำว่า workspace root เป็น project root
เพื่อไม่ให้เข้าใจผิดว่าโปรเจกต์ใช้ formal npm workspace
3. ตรวจสอบ Prisma
ให้ Prisma runtime usage อยู่เฉพาะใน server
Client ไม่ควร import หรือใช้งาน Prisma โดยตรง
Flow ควรเป็น Client → API → Server → Prisma → Database
สิ่งที่ยังไม่ต้องแก้ตอนนี้
ยังไม่จำเป็นต้องเปลี่ยนเป็น npm workspace
ยังไม่จำเป็นต้องสร้าง root-level orchestrator script
ยังไม่ต้องเพิ่ม folders เช่น controllers, services, repositories, middlewares ถ้ายังไม่มี code ที่ต้องใช้
ยังไม่ต้อง refactor architecture เพิ่มเติม
สรุป
ก่อน Merge ให้เน้นแก้เฉพาะ:

README encoding
README wording (workspace root → project root)
ตรวจสอบให้ Prisma อยู่เฉพาะฝั่ง server
ส่วนอื่น ๆ สามารถทำในภายหลังเมื่อเริ่มพัฒนา feature จริง เพื่อไม่ให้ project ซับซ้อนเกินความจำเป็นสำหรับ Lab 1 | แก้ไข README แล้ว ส่วน ``` ที่อยู่ในโค้ดอยากให้มีไว้ และเช็ค PRISMA เรียบร้อยแล้ว ช่วยตรวจสอบอีกที | https://github.com/Kamonnatt23/toktickit/pull/5  |
| PR #6 Feature/2 api health | Piink7878 | Approved | Test file location ยังไม่ตรง Requirement
คือไฟล์อยู่ที่ server/tests/health.test.ts
แต่ในใบแลปให้ต้องอยู่ที่ tests/lab-01/ | แก้เรียบร้อยงับๆ | https://github.com/Kamonnatt23/toktickit/pull/6 |
| PR #7 Feature/3 category seed | Piink7878 | Approved | โค้ดดูดีมากไม่ต้องแก้แล้วว | -  | https://github.com/Kamonnatt23/toktickit/pull/7 |
| PR #8 feat: display IT request category list and add tests- #8
 | Piink7878 | Approved | ลืม Commit โค้ด Backend หรือเปล่า ใน PR ยังไม่เห็นไฟล์ Route ของ Express ที่ใช้ Prisma ดึง categories เลย (มีแต่ไฟล์เทส) รบกวนเพิ่มไฟล์ route ที่ query ด้วย prisma.category.findMany({ orderBy: { id: 'asc' } }) แล้ว mount เข้า Express ให้ด้วยนะจ๊ะะ | แต้งกิ้วฟอยัวคอมเม้น เรา Refactor โค้ดในไฟล์ server/src/app.ts ใหม่นิดนึง เพื่อให้ตัว getPrisma().category.findMany({ orderBy: { id: "asc" } }) แสดงขึ้นมาใน Commit ล่าสุดแล้ว รบกวนลองตรวจสอบอีกครั้งให้หน่อย  | https://github.com/Kamonnatt23/toktickit/pull/8 |

## Pull Requests I reviewed for my partner
|Partner PR | Decusion | My comment | Partner respons |  Evidence |
|----|--------|------------------|
| PR #5 Feature/1 project foundation
 | Approved | ตรงไฟล์ README.md อะ ใน requirement ของ Issue 1 ระบุว่าต้องมีเขียนอธิบายวิธีการ Setup โปรเจกต์ไว้ด้วย เพิ่มพวกคำสั่ง เช่น npm install, วิธีรันแอป, หรือวิธีตั้งค่าไฟล์ env ลงไปใน README หน่อย | docs: update README.md | https://github.com/Piink7878/cpe334-TokTikIT/pull/5 |
| PR #9 Feature/2 api health check
 | Approved |เราดูโค้ด Issue 2 ให้แล้วนะ ทำมาได้กู๊ดๆ API ฝั่ง Backend คืนค่า 200 พร้อม JSON สเตตัสถูกต้องเป๊ะตามที่ Lab กำหนด ส่วนฝั่ง Frontend ก็ทำพวกรอโหลดกับแจ้งเตือน Error ไว้ครบถ้วน แต่ก่อนกด Merge ฝากแก้ 1 จุดสำคัญนิดนึง
ลืม Import ฟังก์ชันใน App.tsx: ในไฟล์ client/src/App.tsx มีการเรียกใช้ checkSystem() แต่เหมือนลืมเขียน import ไว้บรรทัดบนสุด (เห็นในไฟล์ .js ทำไว้แล้ว แต่ใน .tsx ไม่มี) เดี๋ยวตอนบิลด์โค้ดฝั่ง TypeScript มันจะแดง ฝากเติม import { checkSystem } from "./api"; ให้หน่อยน้า
เติมบรรทัด Import เสร็จแล้วทักมาบอกน้า เดี๋ยวมากด Approve ให้จ้า | เราแก้ปัญหาเรื่อง import ใน App.tsx และเคลียร์ไฟล์ .js ตกค้างใน client/src พร้อมเปิด noEmit: true เรียบร้อยแล้ว ตอนนี้ build ผ่านและปุ่ม Check System แสดงผล Online ปกติแล้ว รบกวนตรวจอีกรอบได้เลยยย | https://github.com/Piink7878/cpe334-TokTikIT/pull/9 |
| PR #10 Feature/3 category seed | Approved | งานดีมากเลย! โค้ดส่วน Schema กับ Migration ทำมาได้ครบถ้วน ส่วนไฟล์ Seed ก็ใส่ข้อมูล 4 หมวดหมู่และใช้ upsert เพื่อให้รันซ้ำได้โดยข้อมูลไม่ซ้ำซ้อน ตรงตามโจทย์เป๊ะเลย แต่มีจุดเล็กๆ ฝากแก้เพิ่มนิดนึงน้า ในไฟล์ server/prisma/seed.ts ตอนจบการทำงานของ seed ฝากเติมคำสั่งจัดการ Error และปิดการเชื่อมต่อฐานข้อมูล prisma.$disconnect() ให้หน่อยจ้า ไม่งั้นเดี๋ยวเวลารันในระบบแล้วสคริปต์มันอาจจะค้างได้ | เราอัปเดตไฟล์ server/prisma/seed.ts โดยใส่ try-catch-finally และเพิ่ม prisma.$disconnect() ดักไว้ทั้งกรณี success และ error ตามที่แนะนำเรียบร้อย ลองรัน npx prisma db seed ทดสอบแล้วสคริปต์ก็จบการทำงานได้คลีน ไม่ค้าง ช่วยตรวจดูอีกทีและ Approve ให้หน่อยนะ ขอบคุณฮัฟ | https://github.com/Piink7878/cpe334-TokTikIT/pull/10 |
| PR # | Approved | Kamonnatt23
left a comment
Collaborator
ก่อนจะกด Merge มีจุดเล็กๆ ที่อยากให้เช็คเพื่อความชัวร์หน่อยน้า:ในไฟล์ server/src/app.ts: เช็คดูว่าข้างบนสุดของไฟล์มีการ import { getPrisma } from "./prisma"; (หรือจาก path ที่ถูกต้อง) มาแล้วหรือยัง เพราะในโค้ดมีการเรียกใช้ getPrisma() ถ้าลืม import เดี๋ยวเซิร์ฟเวอร์จะรันไม่ขึ้นจ้าในไฟล์ UI (client/src/App.tsx): เผื่อไว้กรณีที่รันแล้วฐานข้อมูลยังไม่มีข้อมูล (categories ว่างเปล่า) แนะนำให้เพิ่มข้อความบอกผู้ใช้หน่อย เช่น ถ้า categories.length === 0 ให้แสดงข้อความว่า "No categories available" แทนที่จะปล่อยให้เป็น List โล่งๆ
ถ้าเช็ค import ในไฟล์ app.ts เรียบร้อยแล้ว ก็ลุยต่อได้เลยจ้า  | เราแก้แนะ ทั้งเช็คการ import Prisma ในไฟล์ app.ts ที่มีอยู่เรียบร้อยแล้ว การเพิ่ม empty state ให้แสดงข้อความ "No categories available" กรณีที่ไม่มีข้อมูล และการปรับ try-catch ใน api.ts เพื่อให้ UI แสดง error alert ชัดเจนเวลา backend ปิดอยู่ ทุกอย่าง already พร้อมและผ่านการทดสอบแล้ว ฝากตรวจหน่อยเน้อ | https://github.com/Piink7878/cpe334-TokTikIT/pull/12 |


