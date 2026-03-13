import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import StandaloneMapPage from './assets/map_module.tsx';
import './index.css';

const rootElement = document.getElementById('root')!;

if (window.location.pathname === '/map_module') {
  createRoot(rootElement).render(
    <StrictMode>
      <StandaloneMapPage />
    </StrictMode>,
  );
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
