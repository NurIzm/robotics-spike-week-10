// Stitches views/*.html into the site's index.html. `node src/build.js kk` builds the Kazakh copy from src/kk into kk/. Safe to run any time from any cwd.
const fs=require('fs'),path=require('path');
const lang=process.argv[2]||'';
const SITE=path.join(__dirname,'..',lang);
const dir=path.join(__dirname,lang);
let html=fs.readFileSync(path.join(dir,'index.template.html'),'utf8');
html=html.replace(/<!--VIEW:(\w+)-->/g,(m,n)=>{const f=path.join(dir,'views',n+'.html');return fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';});
const tmp=path.join(SITE,'.index.tmp.'+process.pid);
fs.writeFileSync(tmp,html);fs.renameSync(tmp,path.join(SITE,'index.html'));
console.log(path.join(lang,'index.html'),html.length,'bytes');
