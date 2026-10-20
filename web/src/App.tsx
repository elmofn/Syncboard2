import { useAuth } from './hooks/useAuth';
import { Login } from './components/Login';
import { Workspace } from './components/Workspace';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-splash">
        <img src="/brand/mark-primary.svg" alt="SyncBOARD" width={64} height={64} />
      </div>
    );
  }

  if (!user) return <Login />;

  return <Workspace user={user} />;
}
