import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('claude.ai')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
