import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authService } from '../services/auth.service.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();
const prisma = new PrismaClient();

router.post('/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials or account inactive' });
    }

    const isValidPassword = await authService.verifyPassword(password, user.passwordHash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials or account inactive' });
    }

    const rawToken = await authService.createSession(user.id);

    res.cookie('sessionId', rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours in MS, mostly informative, backend enforces true expiry
    });

    return res.status(200).json({
      id: user.id,
      email: user.email,
      role: user.role,
      requiresPasswordChange: user.requiresPasswordChange
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const token = req.cookies?.sessionId;
    if (token) {
      await authService.destroySession(token);
    }
    res.clearCookie('sessionId');
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Explicit handle for unauthenticated logout attempt to fail safely per some specs or just pass
// But requirement says "handle already-logged-out state safely".
// Wait, if already logged out, requireAuth returns 401. So it fails safely. 
// If we want it to return 200 even without cookie, we can bypass requireAuth or handle it.
// Let's modify logout to not use requireAuth if we want to return 200 always, but api-spec says "Auth Requirement: Required".

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  return res.status(200).json(req.user);
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'oldPassword and newPassword are required' });
    }

    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
       return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await authService.verifyPassword(oldPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid old password' });
    }

    const newPasswordHash = await authService.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { 
        passwordHash: newPasswordHash,
        requiresPasswordChange: false 
      }
    });

    // Optionally update the session context or keep it
    return res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
