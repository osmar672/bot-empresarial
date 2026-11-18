import {useState} from 'react';

// Storage can be unavailable in private browsing or embedded contexts.
export default function useStoredToggle(key){
 const [hidden,setHidden]=useState(()=>{try{return localStorage.getItem(key)==='true';}catch{return false;}});
 function toggle(){setHidden(previous=>{const next=!previous;try{localStorage.setItem(key,String(next));}catch{}return next;});}
 return [hidden,toggle];
}
