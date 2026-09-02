# Lab 2 — Peer Review Record 

**Author:** กมนนัทธ์ สีทาไข — 67070501001 — GitHub: @Kamonnatt23

**Peer reviewer:** เบญญาภา รัตนคุโณดม — 67070501030 — GitHub: @Piink7878

## Pull Requests I authored (reviewed by my partner)
| PR | Reviewer | Decision | Comment | My Response | Evidence |
|----|----------|----------|---------|-------------|----------|
| PR #21 docs: add lab 2 specification, test plan, ui and api specs | Piink7878 | request changs | โดยรวมโอเคเลย แต่มีจุดที่อยากให้แก้ก่อน merge นิดหน่อยนะ POST /api/attachments กับ /api/attachments/upload ในแต่ละ spec ไม่ตรงกัน รบกวนเลือกให้เหลืออันเดียว
Related System ระบุว่า required ในบางที่ แต่ใน BR-02 ไม่ได้ใส่ไว้ รบกวนทำให้ตรงกัน
GET /api/attachments/:id/download มีใน api-spec.md แต่ไม่มีใน specification.md น่าจะเพิ่มให้ครบ
Test ยังไม่ค่อยครอบคลุมพวก pagination/filter/sort และกรณี user พยายามเข้าถึง ticket ของคนอื่น โดยเฉพาะเรื่อง user isolation น่าจะเพิ่ม test ไว้หน่อย
Flow ของ attachment ที่ upload ก่อนสร้าง ticket ยังไม่ค่อยชัด โดยเฉพาะกรณีกด Remove ก่อน submit อยากให้ระบุ behavior ไว้นิดนึง
นอกนั้นโอเคเลยย เย่ ๆ | Updated upload endpoint to POST /api/attachments, added Related System to BR-02, clarified pre-submission attachment removal flow, and added tests T-11 to T-13 for security and pagination | https://github.com/Kamonnatt23/toktickit/pull/21 |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

## Pull Requests I reviewed for my partner
| Partner PR | Decision | My Comment | Partner Response | Evidence |
|------------|----------|------------|------------------|----------|
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |


