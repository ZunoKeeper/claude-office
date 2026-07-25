import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

// StrictMode intentionally double-mounts components to surface effect bugs.
// The Pixi Application on the office canvas is stateful and its async init
// races with the immediate unmount/remount, ending with a blank canvas.
// The dev-time safety net isn't worth the broken office view.
createRoot(document.getElementById('app')!).render(<App />);
