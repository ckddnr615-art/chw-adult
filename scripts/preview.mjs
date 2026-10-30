import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../site');
const types={'.html':'text/html;charset=utf-8','.js':'application/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.woff':'font/woff','.ttf':'font/ttf'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error();const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes)}catch{res.writeHead(404);res.end('Not found')}}).listen(Number(process.env.PORT||4182),'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+(process.env.PORT||4182)+' (Google SITE_ORIGINS must allow this address for shared data)'));
