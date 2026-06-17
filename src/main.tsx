// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.tsx'

// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )

import React from 'react';
import ReactDOM from 'react-dom/client';
import {HashRouter} from 'react-router';
import {PrimeReactProvider} from 'primereact/api';
import {StoresProvider, stores} from '@/store';
import '@/assets/icons/index';
import App from './App';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement as HTMLDivElement);

root.render(
    <HashRouter>
        <StoresProvider value={stores}>
            <PrimeReactProvider value={{ ripple: false }}>
                <App />
            </PrimeReactProvider>
        </StoresProvider>
    </HashRouter>
);
