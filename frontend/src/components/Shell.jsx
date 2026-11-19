import InstallApp from './InstallApp.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import NotificationBell from './NotificationBell.jsx';
import {Notice} from './UI.jsx';
import {useAttendance} from '../context/AttendanceContext.jsx';
import useStoredToggle from '../hooks/useStoredToggle.js';
import {useEffect,useState,useRef} from 'react';
import {BookOpen,ChevronRight,FileText,LogOut,Menu,Minimize2,Maximize2,MessageSquareText,ShieldCheck,Users,UserRound,CalendarDays,Clock3,History,X} from 'lucide-react';
import {useAuth} from '../context/AuthContext.jsx';
const primaryTabs = [
 {id:'chat',label:'Asistente',icon:MessageSquareText},
 {id:'documents',label:'Documentos',icon:FileText},
 {id:'attendance',label:'Mi jornada',icon:Clock3},
 {id:'profile',label:'Mi perfil',icon:UserRound},
];
const workspaceTools = [
 {id:'calendar',label:'Calendario',icon:CalendarDays},
 {id:'reports',label:'Reportes',icon:FileText},
 {id:'policies',label:'Políticas y firmas',icon:BookOpen},
];
const managementTools = [
 {id:'hr',label:'Solicitudes RH',icon:Users},
 {id:'users',label:'Colaboradores',icon:Users},
 {id:'knowledge',label:'Revisión de IA',icon:MessageSquareText},
 {id:'audit',label:'Actividad y calidad',icon:History},
 {id:'usage',label:'Plan y consumo',icon:ShieldCheck},
];

function availableManagementTools(role) {
 if (role === 'admin') return managementTools;
 return role === 'rrhh' || role.startsWith('rrhh_') ? managementTools.slice(0, 1) : [];
}

export function Administration({role, onNavigate}) {
 return <div className="page workspace-page">
  <h1>Administración</h1>
  <nav className="workspace-tool-list" aria-label="Herramientas de administración">
   {availableManagementTools(role).map(({id,label,icon:Icon}) =>
    <button className="btn btn-secondary" key={id} onClick={()=>onNavigate(id)}>
     <Icon size={18}/>{label}<ChevronRight size={16}/>
    </button>
   )}
  </nav>
 </div>;
}
export default function Shell({tab,setTab,children}){
 const {session,accountNotice,dismissAccountNotice,dismissAttendanceOffer}=useAuth();const {requestLogout}=useAttendance();const [open,setOpen]=useState(false);
 const mainScroll=useRef(null);
 const accountMenu=useRef(null);
 const management=availableManagementTools(session.user.role);
 const pageLabel=[...primaryTabs,...workspaceTools,...management,
  {id:'requests',label:'Mis solicitudes'},{id:'security',label:'Seguridad'},
  {id:'administration',label:'Administración'}
 ].find(item=>item.id===tab)?.label;
 function navigate(next,id){
  if(accountMenu.current) accountMenu.current.open=false;
  setOpen(false);
  dismissAttendanceOffer();
  setTab(next,id);
 }
 useEffect(()=>{
  function closeAccount(event){
   if(!accountMenu.current?.contains(event.target)&&accountMenu.current) accountMenu.current.open=false;
  }
  document.addEventListener('pointerdown',closeAccount);
  return ()=>document.removeEventListener('pointerdown',closeAccount);
 },[]);
 useEffect(()=>{setOpen(false);mainScroll.current?.scrollTo({top:0,left:0});},[tab]);
 const [sidebarHidden,toggleSidebar]=useStoredToggle('luma.sidebarHidden');
 const first=session?.user?.name?.charAt(0)?.toUpperCase()||'U';
 return <div className={'layout '+(sidebarHidden?'sidebar-hidden':'')}>
  {open&&<button className="mobile-scrim" aria-label="Cerrar menú" onClick={()=>setOpen(false)}/>}
  <aside id="workspace-navigation" className={'sidebar '+(open?'sidebar-open':'')}>
   <div className="side-top"><div className="brand-mark">L<span>•</span></div><div className="brand-copy"><strong>Luma</strong><span>Tu espacio de conocimiento</span></div><button className="icon-button close-side" onClick={()=>setOpen(false)} aria-label="Cerrar menú"><X size={19}/></button></div>
   <div className="side-divider"/><div className="side-heading side-heading-row"><span>ESPACIO DE TRABAJO</span><button className="panel-close desktop-panel-close" aria-label={sidebarHidden?'Expandir menú lateral':'Ocultar menú lateral'} title={sidebarHidden?'Expandir menú lateral':'Ocultar menú lateral'} aria-expanded={!sidebarHidden} aria-controls="workspace-navigation" onClick={toggleSidebar}>{sidebarHidden?<Maximize2 size={15} strokeWidth={1.8}/>:<Minimize2 size={15} strokeWidth={1.8}/>}</button></div>
   <nav className="side-nav" aria-label="Navegación principal">{primaryTabs.map(({id,label,icon:Icon})=><button key={id} aria-label={label} aria-current={tab===id?'page':undefined} data-tooltip={label} className={'nav-item '+(tab===id?'nav-selected':'')} onClick={()=>navigate(id)}><Icon size={19} strokeWidth={1.9}/><span>{label}</span></button>)}</nav>
  </aside>
  <main className="main-area">
   <InstallApp/>
   <header className="topbar">
    <button className="icon-button mobile-menu" aria-label="Abrir menú" aria-expanded={open} aria-controls="workspace-navigation" onClick={()=>setOpen(true)}><Menu size={21}/></button>
    <div className="breadcrumbs"><strong>{pageLabel}</strong></div>
    <div className="topbar-right">
     <GlobalSearch onNavigate={navigate}/>
     <NotificationBell onNavigate={navigate}/>
     <details className="workspace-account" ref={accountMenu} onKeyDown={event=>{
      if(event.key==='Escape'&&event.currentTarget.open){
       event.currentTarget.open=false;
       event.currentTarget.querySelector('summary').focus();
      }
     }}>
      <summary className="tiny-avatar" aria-label="Menú de cuenta">{session.user.photo_url?<img className="account-photo" src={session.user.photo_url} alt=""/>:first}</summary>
      <div className="workspace-account-panel">
       <strong>{session.user.name}</strong>
       <small>{session.company?.name}</small>
       <button onClick={()=>navigate('requests')}>Mis solicitudes</button>
       {workspaceTools.map(({id,label})=><button key={id} onClick={()=>navigate(id)}>{label}</button>)}
       {management.length>0&&<button onClick={()=>navigate('administration')}>Administración</button>}
       <button onClick={()=>navigate('security')}>Seguridad</button>
       <a href="/guia-practica.pdf" target="_blank" rel="noreferrer">Guía de la práctica</a>
       <button onClick={()=>{accountMenu.current.open=false;requestLogout();}}><LogOut size={16}/>Cerrar sesión</button>
      </div>
     </details>
    </div>
   </header>
   {accountNotice&&<div className="account-notice"><Notice success={accountNotice} onClose={dismissAccountNotice}/></div>}
   <div ref={mainScroll} className={"main-scroll "+(tab==='chat'?'chat-scroll':'')}>{children}</div>
  </main>
 </div>;
}
