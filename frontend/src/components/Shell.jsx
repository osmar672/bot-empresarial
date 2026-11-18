import useStoredToggle from '../hooks/useStoredToggle.js';
import {useEffect,useState} from 'react';
import {BookOpen,ChevronRight,FileText,LogOut,Menu,ChevronsLeft,LayoutGrid,MessageSquareText,ShieldCheck,Users,X} from 'lucide-react';
import {useAuth} from '../context/AuthContext.jsx';
const tabs=[{id:'profile',label:'Mi perfil',icon:Users},{id:'chat',label:'Asistente',icon:MessageSquareText},{id:'documents',label:'Documentos',icon:FileText},{id:'users',label:'Colaboradores',icon:Users},{id:'usage',label:'Plan y consumo',icon:ShieldCheck}];
export default function Shell({tab,setTab,children}){
 const {session,logout}=useAuth();const [open,setOpen]=useState(false);
 useEffect(()=>setOpen(false),[tab]);
 const [sidebarHidden,toggleSidebar]=useStoredToggle('luma.sidebarHidden');
 const first=session?.user?.name?.charAt(0)?.toUpperCase()||'U';
 return <div className={'layout '+(sidebarHidden?'sidebar-hidden':'')}>
  {open&&<button className="mobile-scrim" aria-label="Cerrar menú" onClick={()=>setOpen(false)}/>}
  <aside id="workspace-navigation" className={'sidebar '+(open?'sidebar-open':'')}>
   <div className="side-top"><div className="brand-mark">L<span>•</span></div><div className="brand-copy"><strong>Luma</strong><span>Tu espacio de conocimiento</span></div><button className="icon-button close-side" onClick={()=>setOpen(false)} aria-label="Cerrar menú"><X size={19}/></button></div>
   <div className="side-divider"/><div className="side-heading side-heading-row"><span>ESPACIO DE TRABAJO</span><button className="panel-close desktop-panel-close" aria-label="Ocultar menú lateral" title="Ocultar menú lateral" aria-expanded={!sidebarHidden} aria-controls="workspace-navigation" onClick={toggleSidebar}><ChevronsLeft size={16} strokeWidth={1.7}/></button></div>
   <nav className="side-nav" aria-label="Navegación principal">{tabs.filter(t=>!['users','usage'].includes(t.id)||session?.user?.role==='admin').map(({id,label,icon:Icon})=><button key={id} className={'nav-item '+(tab===id?'nav-selected':'')} onClick={()=>setTab(id)}><Icon size={19} strokeWidth={1.9}/><span>{label}</span>{tab===id&&<span className="nav-indicator"/>}</button>)}</nav>
   <div className="sidebar-spacer"/>
   <a className="guide-link" href="/guia-practica.pdf" target="_blank" rel="noreferrer"><BookOpen size={17}/> Guía de la práctica <ChevronRight size={15}/></a>
   <div className="profile-card"><button className="profile-open" aria-label="Abrir mi perfil" onClick={()=>setTab('profile')}/><div className="avatar">{first}</div><div className="profile-copy"><strong title={session?.user?.name}>{session?.user?.name}</strong><span>{session?.company?.name}</span></div><button className="icon-button" title="Cerrar sesión" onClick={logout}><LogOut size={18}/></button></div>
  </aside>
  <main className="main-area"><header className="topbar">{sidebarHidden&&<button className="panel-restore desktop-sidebar-toggle" aria-label="Mostrar menú lateral" title="Mostrar menú lateral" aria-expanded={false} aria-controls="workspace-navigation" onClick={toggleSidebar}><LayoutGrid size={16} strokeWidth={1.7}/><span>Menú</span></button>}<button className="icon-button mobile-menu" aria-label="Abrir menú" aria-expanded={open} aria-controls="workspace-navigation" onClick={()=>setOpen(true)}><Menu size={21}/></button><div className="breadcrumbs">ESPACIO DE TRABAJO <ChevronRight size={13}/> <strong>{tabs.find(t=>t.id===tab)?.label}</strong></div><div className="topbar-right"><span className="role-tag">{session?.user?.role_label||session?.user?.role||'Usuario'}</span><button className="tiny-avatar" aria-label="Abrir mi perfil" onClick={()=>setTab('profile')}>{first}</button></div></header><div className={"main-scroll "+(tab==='chat'?'chat-scroll':'')}>{children}</div></main>
 </div>;
}
