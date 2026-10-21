import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { ENTERING_KEY } from './lib/auth';
import { Login } from './components/Login';
import { Workspace } from './components/Workspace';
import { CubeSpinner } from './components/CubeSpinner';

/** Duração de uma volta completa do GIF do cubo (cube-assembly-128.gif). */
const CUBE_LOOP_MS = 6000;

function Splash({ label }: { label: string }) {
  return (
    <div className="app-splash">
      <CubeSpinner size={120} label={label} />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const [entering, setEntering] = useState(() => {
    try {
      return sessionStorage.getItem(ENTERING_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Após o login, garante pelo menos uma volta completa do cubo antes de abrir o quadro.
  useEffect(() => {
    if (!entering || !user) return;
    const t = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(ENTERING_KEY);
      } catch {
        /* ignore */
      }
      setEntering(false);
    }, CUBE_LOOP_MS);
    return () => window.clearTimeout(t);
  }, [entering, user]);

  if (loading) return <Splash label="Carregando o SyncBOARD" />;
  if (!user) return <Login />;
  if (entering) return <Splash label="Entrando no SyncBOARD" />;

  return <Workspace user={user} />;
}
