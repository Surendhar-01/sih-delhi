import 'leaflet/dist/leaflet.css';

import '../index.css';
import MapTrackingModule from '../components/MapTrackingModule';

const defaultLocalApi = '';
const apiBase = (import.meta.env.VITE_API_URL ?? localStorage.getItem('AEGIS_API_BASE') ?? defaultLocalApi).replace(/\/$/, '');

export default function StandaloneMapPage() {
  const params = new URLSearchParams(window.location.search);
  const themeParam = params.get('theme');
  const theme = themeParam === 'light' || themeParam === 'dark' ? themeParam : 'light';

  return (
    <MapTrackingModule
      apiBase={apiBase}
      theme={theme}
      onClose={() => window.close()}
    />
  );
}
