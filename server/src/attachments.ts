import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getPrisma } from './prisma.js';

const router = Router();

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Helper to authenticate
const authRequester = async (req: Request, res: Response) => {
  const requesterIdStr = req.header("X-Requester-Id");
  if (!requesterIdStr) return { error: 401, message: "Missing X-Requester-Id header" };
  const requesterId = parseInt(requesterIdStr, 10);
  if (isNaN(requesterId)) return { error: 401, message: "Invalid X-Requester-Id header" };
  const requester = await getPrisma().requesterUser.findUnique({ where: { id: requesterId } });
  if (!requester || !requester.isActive) return { error: 401, message: "Unauthorized" };
  return { requesterId };
};

router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const auth = await authRequester(req, res);
    if ('error' in auth) {
      return res.status(auth.error).json({ error: auth.message });
    }

    await new Promise<void>((resolve, reject) => {
      upload.single('file')(req, res, (err: any) => {
        if (err) return reject(err);
        resolve();
      });
    });

    if (!req.file) {
      return res.status(400).json({ error: "File is required" });
    }

    let ticketId: number | null = null;
    if (req.body.ticketId) {
      ticketId = parseInt(req.body.ticketId, 10);
      if (isNaN(ticketId)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Invalid ticketId" });
      }

      const ticket = await getPrisma().ticket.findUnique({
        where: { id: ticketId },
        include: { attachments: { where: { isDeleted: false } } }
      });

      if (!ticket) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: "Ticket not found" });
      }

      if (ticket.requesterId !== auth.requesterId) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: "Forbidden: Not your ticket" });
      }

      if (ticket.attachments.length >= 5) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Ticket already has 5 attachments" });
      }
    }

    const attachment = await getPrisma().attachment.create({
      data: {
        ticketId,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        filePath: req.file.filename,
      }
    });

    return res.status(201).json(attachment);
  } catch (err: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    if (err.message === 'Invalid file type' || err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: "Invalid file type or size exceeded" });
    }
    return res.status(500).json({ error: "Server error" });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const auth = await authRequester(req, res);
    if ('error' in auth) return res.status(auth.error).json({ error: auth.message });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const attachment = await getPrisma().attachment.findUnique({
      where: { id },
      include: { ticket: true }
    });

    if (!attachment) return res.status(404).json({ error: "Not found" });
    if (attachment.ticket && attachment.ticket.requesterId !== auth.requesterId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.status(200).json({
      id: attachment.id,
      ticketId: attachment.ticketId,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
      isDeleted: attachment.isDeleted
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

router.get('/:id/download', async (req: Request, res: Response): Promise<any> => {
  try {
    const auth = await authRequester(req, res);
    if ('error' in auth) return res.status(auth.error).json({ error: auth.message });

    const id = parseInt(req.params.id, 10);
    const attachment = await getPrisma().attachment.findUnique({
      where: { id },
      include: { ticket: true }
    });

    if (!attachment || attachment.isDeleted) return res.status(404).json({ error: "Not found" });
    if (attachment.ticket && attachment.ticket.requesterId !== auth.requesterId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const filePath = path.join(uploadDir, attachment.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on disk" });

    res.setHeader('Content-Type', attachment.fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const auth = await authRequester(req, res);
    if ('error' in auth) return res.status(auth.error).json({ error: auth.message });

    const id = parseInt(req.params.id, 10);
    const attachment = await getPrisma().attachment.findUnique({
      where: { id },
      include: { ticket: true }
    });

    if (!attachment || attachment.isDeleted) return res.status(404).json({ error: "Not found" });
    if (attachment.ticket && attachment.ticket.requesterId !== auth.requesterId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    // Some implementations might send it in body, some in query. Let's support body.
    // Wait, express router.delete with body might need express.json() which is at app.ts level.
    const { removalReason } = req.body || {};
    if (!removalReason || String(removalReason).trim() === '') {
       return res.status(400).json({ error: "Removal reason is required" });
    }

    await getPrisma().attachment.update({
      where: { id },
      data: { 
        isDeleted: true,
        removalReason: String(removalReason).trim()
      }
    });

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
