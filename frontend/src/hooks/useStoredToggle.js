import {useState} from 'react';

// Storage can be unavailable in private browsing or embedded contexts.
export default function useStoredToggle(key,defaultHidden=false){
 const [hidden,setHidden]=useState(()=>{try{const value=localStorage.getItem(key);return value===null?defaultHidden:value==='true';}catch{return defaultHidden;}});
 function toggle(){setHidden(previous=>{const next=!previous;try{localStorage.setItem(key,String(next));}catch{}return next;});}
 return [hidden,toggle];
}
