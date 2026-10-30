import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function guide(){
 const markdown=await fs.readFile(fileURLToPath(new URL('../README.md',import.meta.url)),'utf8');
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');let code=false,body='',table=false;
 const inline=s=>esc(s).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/https:\/\/[^\s<]+/g,u=>'<a href="'+u+'">'+u+'</a>');
 for(const line of markdown.split('\n')){
  if(line.startsWith('```')){if(table){body+='</tbody></table>';table=false}body+=code?'</code></pre>':'<pre><code>';code=!code;continue}
  if(code){body+=esc(line)+'\n';continue}
  if(line.startsWith('|')){if(/^\|[\s|:-]+\|$/.test(line))continue;if(!table){body+='<div class="table"><table><tbody>';table=true}body+='<tr>'+line.split('|').slice(1,-1).map(c=>'<td>'+inline(c.trim())+'</td>').join('')+'</tr>';continue}
  if(table){body+='</tbody></table></div>';table=false}
  if(!line.trim())continue;const h=line.match(/^(#{1,3}) (.*)$/);body+=h?'<h'+h[1].length+'>'+inline(h[2])+'</h'+h[1].length+'>':'<p>'+inline(line)+'</p>';
 }
 return '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>충현복지관 · GitHub 자동 배포 연결</title><style>body{margin:0;background:#f2f5fa;color:#263e5e;font:16px/1.8 system-ui,sans-serif}main{max-width:960px;margin:28px auto;background:white;padding:36px;border-radius:20px}h1{font-size:28px;color:#345591}h2{border-top:1px solid #dbe4f0;padding-top:26px;margin-top:38px}table{border-collapse:collapse;width:100%}.table{overflow:auto}td{padding:10px;border:1px solid #dbe4f0}tr:first-child{background:#edf2f9;font-weight:700}pre{background:#eff3f8;padding:18px;border-radius:12px;overflow:auto}a{color:#345591;overflow-wrap:anywhere}button{padding:10px 16px;border:0;border-radius:8px;background:#345591;color:white}@media(max-width:700px){main{margin:0;padding:20px}}@media print{body{background:white}main{margin:0;padding:0}button{display:none}h2,h3{break-after:avoid}}</style><main><button onclick="print()">인쇄 / PDF 저장</button>'+body+'</main></html>';
}
