import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import SafeMarkdown,{safeHref} from '../../frontend/src/components/SafeMarkdown.js';

test('actual chat renderer drops raw HTML, executable links and remote images while preserving text',()=>{
 for(const text of ['<script>alert(1)</script>','<img src=x onerror=alert(1)>','[abrir](javascript:alert%281%29)','[abrir](data:text/html,evil)','![foto](https://tracker.example/pixel)']){
  const html=renderToStaticMarkup(createElement(SafeMarkdown,null,text));
  assert.doesNotMatch(html,/<script|<img|onerror=|href="(?:javascript|data):/i);
 }
 const html=renderToStaticMarkup(createElement(SafeMarkdown,null,'**Seguro** [fuente](https://example.test)'));
 assert.match(html,/<strong>Seguro<\/strong>/);assert.match(html,/rel="noopener noreferrer"/);
 assert.match(renderToStaticMarkup(createElement('span',null,'<img onerror=alert(1)>')),/&lt;img/);
});
test('untrusted task links cannot use active content, protocol-relative URLs or control characters',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,x','//evil.test','https:\\evil.test','java\nscript:alert(1)'])assert.equal(safeHref(url),undefined);
 for(const url of ['https://example.test/docs','/api/documents/123/content','#fuente'])assert.equal(safeHref(url),url);
});
