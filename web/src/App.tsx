import { useAuth } from './hooks/useAuth';
import { Login } from './components/Login';
import { Workspace } from './components/Workspace';
import { CubeSpinner } from './components/CubeSpinner';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-splash">
        <CubeSpinner size={72} label="Carregando o SyncBOARD" />
      </div>
    );
  }

  if (!user) return <Login />;

  return <Workspace user={user} />;
}
