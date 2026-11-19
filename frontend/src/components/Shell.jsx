import NotificationBell from './NotificationBell.jsx';
import {Notice} from './UI.jsx';
import {AttendanceLauncher,useAttendance} from '../context/AttendanceContext.jsx';
import useStoredToggle from '../hooks/useStoredToggle.js';
import {useEffect,useState,useRef} from 'react';
import {BookOpen,ChevronRight,FileText,LogOut,Menu,Minimize2,Maximize2,MessageSquareText,ShieldCheck,Users,UserRound,CalendarDays,History,X} from 'lucide-react';
import {useAuth} from '../context/AuthContext.jsx';
const tabs=[{id:'profile',label:'Mi perfil',icon:UserRound},{id:'chat',label:'Asistente',icon:MessageSquareText},{id:'documents',label:'Documentos',icon:FileText},{id:'users',label:'Colaboradores',icon:Users},{id:'hr',label:'Solicitudes RH',icon:Users},{id:'calendar',label:'Calendario',icon:CalendarDays},{id:'security',label:'Seguridad',icon:ShieldCheck},{id:'audit',label:'Actividad y calidad',icon:History},{id:'usage',label:'Plan y consumo',icon:ShieldCheck}];
export default function Shell({tab,setTab,children}){
 const {session,accountNotice,dismissAccountNotice}=useAuth();const {requestLogout}=useAttendance();const [open,setOpen]=useState(false);
 const mainScroll=useRef(null);
 useEffect(()=>{setOpen(false);mainScroll.current?.scrollTo({top:0,left:0});},[tab]);
 const [sidebarHidden,toggleSidebar]=useStoredToggle('luma.sidebarHidden');
 const first=session?.user?.name?.charAt(0)?.toUpperCase()||'U';
 return <div className={'layout '+(sidebarHidden?'sidebar-hidden':'')}>
  {open&&<button className="mobile-scrim" aria-label="Cerrar menú" onClick={()=>setOpen(false)}/>}
  <aside id="workspace-navigation" className={'sidebar '+(open?'sidebar-open':'')}>
   <div className="side-top"><div className="brand-mark">L<span>•</span></div><div className="brand-copy"><strong>Luma</strong><span>Tu espacio de conocimiento</span></div><button className="icon-button close-side" onClick={()=>setOpen(false)} aria-label="Cerrar menú"><X size={19}/></button></div>
   <div className="side-divider"/><div className="side-heading side-heading-row"><span>ESPACIO DE TRABAJO</span><button className="panel-close desktop-panel-close" aria-label={sidebarHidden?'Expandir menú lateral':'Ocultar menú lateral'} title={sidebarHidden?'Expandir menú lateral':'Ocultar menú lateral'} aria-expanded={!sidebarHidden} aria-controls="workspace-navigation" onClick={toggleSidebar}>{sidebarHidden?<Maximize2 size={15} strokeWidth={1.8}/>:<Minimize2 size={15} strokeWidth={1.8}/>}</button></div>
   <nav className="side-nav" aria-label="Navegación principal">{tabs.filter(t=>t.id==='hr'?session.user.role==='admin'||session.user.role==='rrhh'||session.user.role.startsWith('rrhh_'):!['users','usage','audit'].includes(t.id)||session?.user?.role==='admin').map(({id,label,icon:Icon})=><button key={id} title={label} aria-label={label} aria-current={tab===id?'page':undefined} data-tooltip={label} className={'nav-item '+(tab===id?'nav-selected':'')} onClick={()=>setTab(id)}><Icon size={19} strokeWidth={1.9}/><span>{label}</span>{tab===id&&<span className="nav-indicator"/>}</button>)}</nav>
   <div className="sidebar-spacer"/>
   <a className="guide-link" href="/guia-practica.pdf" target="_blank" rel="noreferrer" aria-label="Guía de la práctica" data-tooltip="Guía de la práctica"><BookOpen size={17}/><span>Guía de la práctica</span><ChevronRight size={15}/></a>
   <div className="profile-card"><button className="profile-open" aria-label="Abrir mi perfil" onClick={()=>setTab('profile')}/><div className="avatar">{session.user.photo_url?<img className="account-photo" src={session.user.photo_url} alt=""/>:first}</div><div className="profile-copy"><strong title={session?.user?.name}>{session?.user?.name}</strong><span>{session?.company?.name}</span></div><button className="icon-button" title="Cerrar sesión" onClick={requestLogout}><LogOut size={18}/></button></div>
  </aside>
  <main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Abrir menú" aria-expanded={open} aria-controls="workspace-navigation" onClick={()=>setOpen(true)}><Menu size={21}/></button><div className="breadcrumbs">ESPACIO DE TRABAJO <ChevronRight size={13}/> <strong>{tabs.find(t=>t.id===tab)?.label}</strong></div><div className="topbar-right"><NotificationBell onNavigate={setTab}/><AttendanceLauncher/><span className="role-tag">{session?.user?.role_label||session?.user?.role||'Usuario'}</span><button className="tiny-avatar" aria-label="Abrir mi perfil" onClick={()=>setTab('profile')}>{session.user.photo_url?<img className="account-photo" src={session.user.photo_url} alt=""/>:first}</button></div></header>{accountNotice&&<div className="account-notice"><Notice success={accountNotice} onClose={dismissAccountNotice}/></div>}<div ref={mainScroll} className={"main-scroll "+(tab==='chat'?'chat-scroll':'')}>{children}</div></main>
 </div>;
}
