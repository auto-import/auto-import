'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Utilisateur, Permission } from '@/types';
import { utilisateurs, getUserPermissions, getRoleById } from '@/lib/mockData';

interface AuthContextValue {
  currentUser: Utilisateur;
  setCurrentUser: (user: Utilisateur) => void;
  hasPermission: (permission: Permission) => boolean;
  getUserPermissions: () => Permission[];
  switchUser: (userId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Utilisateur>(() => {
    return utilisateurs.find((u) => u.id === 'usr-001') || utilisateurs[0];
  });

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      if (currentUser.role === 'super_admin') return true;
      const role = getRoleById(currentUser.role_id || '');
      if (!role) return false;
      return role.permissions.includes(permission);
    },
    [currentUser]
  );

  const permissions = useCallback((): Permission[] => {
    return getUserPermissions(currentUser.id);
  }, [currentUser]);

  const switchUser = useCallback((userId: string) => {
    const user = utilisateurs.find((u) => u.id === userId);
    if (user) setCurrentUser(user);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        hasPermission,
        getUserPermissions: permissions,
        switchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
