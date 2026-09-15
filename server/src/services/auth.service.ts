import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;
const SESSION_EXPIRATION_HOURS = 24;

export const authService = {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  },

  generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  },

  async createSession(userId: number) {
    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);

    await prisma.session.create({
      data: {
        tokenHash,
        userId,
      }
    });

    return rawToken;
  },

  async verifySession(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!session) return null;

    // Check expiration
    const expirationMs = SESSION_EXPIRATION_HOURS * 60 * 60 * 1000;
    const isExpired = Date.now() - session.lastActiveAt.getTime() > expirationMs;

    if (isExpired) {
      await prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    if (!session.user.isActive) {
      return null;
    }

    // Refresh lastActiveAt
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() }
    });

    return session.user;
  },

  async destroySession(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    try {
      await prisma.session.delete({ where: { tokenHash } });
    } catch (e) {
      // Ignore if session not found
    }
  }
};
