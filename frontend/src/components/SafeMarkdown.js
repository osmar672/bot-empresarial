import {createElement} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function safeHref(value){
 if(typeof value!=='string'||/[\u0000-\u0020\u007f\\]/.test(value))return undefined;
 if(value.startsWith('/')&&!value.startsWith('//'))return value;
 if(value.startsWith('#'))return value;
 try{const url=new URL(value);return ['https:','http:','mailto:'].includes(url.protocol)?value:undefined;}catch{return undefined;}
}
// Untrusted assistant/document text is Markdown, never executable HTML.
export default function SafeMarkdown({children}){
 return createElement(Markdown,{remarkPlugins:[remarkGfm],skipHtml:true,components:{
  a:({href,children})=>createElement('a',{href:safeHref(href),target:'_blank',rel:'noopener noreferrer'},children),
  img:({alt})=>createElement('span',null,alt||'Imagen omitida')
 }},children);
}
