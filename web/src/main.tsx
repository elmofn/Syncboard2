import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import './styles/base.css';
import './styles/app.css';
import { IconContext } from '@phosphor-icons/react';
import App from './App';
import { ConfirmProvider } from './components/ConfirmDialog';
import { initTheme } from './lib/theme';

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={{ weight: 'thin', size: 18 }}>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </IconContext.Provider>
  </StrictMode>,
);
