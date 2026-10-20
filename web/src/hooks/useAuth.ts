import { useEffect, useState } from 'react';
import type { ClientPrincipal } from '../types/api';
import { getUserInfo } from '../lib/auth';

export function useAuth() {
  // undefined = carregando; null = não autenticado
  const [user, setUser] = useState<ClientPrincipal | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    getUserInfo().then((u) => active && setUser(u));
    return () => {
      active = false;
    };
  }, []);
  return { user, loading: user === undefined };
}
