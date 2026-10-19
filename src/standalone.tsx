import { createRoot } from 'react-dom/client';
import PitonApp from './PitonApp';
import '../app/globals.css';
import './lesson.css';

const target = document.getElementById('root');
if (!target) throw new Error('Root element is missing.');
createRoot(target).render(<PitonApp initialPath={window.location.pathname + window.location.search} />);
