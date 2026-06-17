

import React from 'react';
import Dashboard from './view/Dashboard';
import 'primereact/resources/primereact.min.css';
import 'primereact/resources/themes/lara-light-blue/theme.css';
import '@/index.css';
import '@/styles/index.less';

function App() {
    return (
        <div className='app'>
            <Dashboard />
        </div>
    );
}

export default App;
