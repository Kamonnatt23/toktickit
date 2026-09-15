import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    requiresPasswordChange: boolean;
    name: string;
  };
}

export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  const token = req.cookies?.sessionId;
  
  if (!token) {
    return res.status(401).json({ error: 'Invalid credentials or account inactive' }); // Generic 401
  }

  const user = await authService.verifySession(token);
  if (!user) {
    res.clearCookie('sessionId'); // Clean up invalid cookie
    return res.status(401).json({ error: 'Invalid credentials or account inactive' });
  }

  // Enforce first-login password change
  if (user.requiresPasswordChange) {
    // Only allow logout and change-password endpoints
    if (!req.originalUrl.includes('/api/auth/logout') && !req.originalUrl.includes('/api/auth/change-password')) {
      return res.status(403).json({ error: 'Forbidden: Password change required' });
    }
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    requiresPasswordChange: user.requiresPasswordChange,
    name: user.name
  };

  next();
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): any => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};
