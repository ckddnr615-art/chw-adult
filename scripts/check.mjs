import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(root,'site');
async function walk(dir){const files=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Symbolic link is not a site asset: '+entry.name);if(entry.isDirectory())files.push(...await walk(file));else files.push(file)}return files}
const files=await walk(site);
const forbidden=/(^|[/\\])(node_modules|apps-script|\.git|\.env[^/\\]*|\.local|backups|\.wrangler)([/\\]|$)|\.(gs|sqlite|zip|db)$/i;
for(const file of files){const rel=path.relative(site,file);if(forbidden.test(rel)||(!['_headers','_redirects'].includes(rel)&&!['.js','.html','.css','.png','.jpg','.jpeg','.webp','.svg','.woff','.woff2','.ttf','.ico'].includes(path.extname(file))))throw Error('Not a public asset: '+rel);if((await fs.stat(file)).size>25*1024*1024)throw Error('Asset exceeds 25 MiB: '+rel);if(path.extname(file)==='.js')new vm.Script(await fs.readFile(file,'utf8'),{filename:rel})}
const context=vm.createContext({window:{}});vm.runInContext(await fs.readFile(path.join(site,'google-config.js'),'utf8'),context);
const config=context.window.GOOGLE_SHARED_CONFIG;let url;try{url=new URL(config.webAppUrl)}catch{throw Error('google-config.js: webAppUrl must contain the real /exec URL inside quotation marks.')}
if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!url.pathname.endsWith('/exec')||url.search||url.hash)throw Error('Invalid Google web app URL.');
const html=await fs.readFile(path.join(site,'index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){const value=match[1];if(/^(https?:|data:)/.test(value))continue;const target=path.resolve(site,value.split('?')[0]);if(!target.startsWith(site+path.sep))throw Error('Asset path escapes site directory.');await fs.access(target)}
const order=['google-config.js','google-transport.js','report-projection.js','operations.js'];let previous=-1;for(const name of order){const offset=html.indexOf('src="'+name+'"');if(offset<previous||offset<0)throw Error('Incorrect script loading order: '+name);previous=offset}
for(const file of (await walk(path.join(root,'apps-script'))).filter(n=>n.endsWith('.gs'))){const source=await fs.readFile(file,'utf8');new vm.Script(source,{filename:path.basename(file)});if(/\|\|=|&&=|\?\?=|Object\.hasOwn\(|\.at\(/.test(source))throw Error('Apps Script compatibility regression: '+path.basename(file))}
const wrangler=JSON.parse(await fs.readFile(path.join(root,'wrangler.jsonc'),'utf8'));if(wrangler.main||wrangler.d1_databases||wrangler.triggers||wrangler.assets?.directory!=='./dist')throw Error('Expected static-only deployment without server or D1 bindings.');
console.log('Checked '+files.length+' public assets, Google URL, load order and Apps Script compatibility.');
