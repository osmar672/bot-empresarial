import React from 'react';
import {createRoot} from 'react-dom/client';
import ConfirmProvider from './components/ConfirmProvider.jsx';
import App from './app/App.jsx';
import {AuthProvider} from './context/AuthContext.jsx';
import './styles/global.css';
import './styles/chat-workspace.css';
import './styles/attendance.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><AuthProvider><ConfirmProvider><App/></ConfirmProvider></AuthProvider></React.StrictMode>);
