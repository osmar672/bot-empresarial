export function speechText(markdown){
 return String(markdown||'').replace(/```[\s\S]*?```/g,' Hay un bloque de código disponible en el texto. ').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/\[\d+\]/g,'').replace(/<[^>]+>/g,'').replace(/^[#>*\-]+\s*/gm,'').replace(/[*_`|]/g,'').replace(/\s+/g,' ').replace(/\s+([.,;:!?])/g,'$1').trim();
}
export function speechChunks(text){const words=text.split(/\s+/),chunks=[];let current='';for(const word of words){if(current.length+word.length>220&&current){chunks.push(current);current='';}current+=(current?' ':'')+word;}if(current)chunks.push(current);return chunks;}
