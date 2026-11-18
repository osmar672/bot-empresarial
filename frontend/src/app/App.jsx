import HRRequests from '../pages/HRRequests.jsx';
import {AttendanceProvider} from '../context/AttendanceContext.jsx';
import {useState} from 'react';
import {useAuth} from '../context/AuthContext.jsx';
import {Spinner} from '../components/UI.jsx';
import Shell from '../components/Shell.jsx';
import Login from '../pages/Login.jsx';
import Chat from '../pages/Chat.jsx';
import Documents from '../pages/Documents.jsx';
import Users from '../pages/Users.jsx';
import Profile from '../pages/Profile.jsx';
import Usage from '../pages/Usage.jsx';
export default function App(){const {loading,session}=useAuth(),[tab,setTab]=useState('chat');
 if(loading)return <div className="boot"><Spinner label="Preparando tu espacio…"/></div>;
 if(!session)return <Login/>;
 const isHR=session.user.role==='admin'||session.user.role==='rrhh'||session.user.role.startsWith('rrhh_');
 const page=tab==='hr'&&isHR?<HRRequests/>:tab==='profile'?<Profile/>:tab==='documents'?<Documents/>:tab==='users'&&session.user.role==='admin'?<Users/>:tab==='usage'&&session.user.role==='admin'?<Usage/>:<Chat onDocuments={()=>setTab('documents')}/>;
 return <AttendanceProvider key={session.user.id}><Shell tab={tab} setTab={setTab}>{page}</Shell></AttendanceProvider>;
}
