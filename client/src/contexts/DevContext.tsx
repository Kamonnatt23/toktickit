import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface DevContextType {
  activeUser: User | null;
  setActiveUser: (user: User | null) => void;
  users: User[];
  loading: boolean;
  error: string | null;
}

const DevContext = createContext<DevContextType | undefined>(undefined);

export function DevProvider({ children }: { children: ReactNode }) {
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let initialUser: User | null = null;
    const saved = localStorage.getItem('dev_requester_user');
    if (saved) {
      try {
        initialUser = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved user", e);
      }
    }

    const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    
    // Fetch active users
    fetch(`${API_URL}/api/dev/users`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch dev users');
        return res.json();
      })
      .then((data: User[]) => {
        setUsers(data);
        setLoading(false);
        if (initialUser) {
          if (data.some(u => u.id === initialUser!.id)) {
            setActiveUser(initialUser);
          } else {
            localStorage.removeItem('dev_requester_user');
          }
        }
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSetActiveUser = (user: User | null) => {
    setActiveUser(user);
    if (user) {
      localStorage.setItem('dev_requester_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('dev_requester_user');
    }
  };

  return (
    <DevContext.Provider value={{ activeUser, setActiveUser: handleSetActiveUser, users, loading, error }}>
      {children}
    </DevContext.Provider>
  );
}

export function useDevContext() {
  const context = useContext(DevContext);
  if (context === undefined) {
    throw new Error('useDevContext must be used within a DevProvider');
  }
  return context;
}
