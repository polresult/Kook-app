const fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const recipes=JSON.parse(html.match(/const R=(\[.*?\]);/s)[1]);
const photos=JSON.parse(html.match(/const PHOTOS=(\{.*?\});/s)[1]);
const batch=JSON.parse(fs.readFileSync(path.join(root,'BOEKEN-BATCH.json'),'utf8'));
assert.equal(batch.recipes.length,80);
for(const b of batch.recipes){const r=recipes.find(x=>x.id===b.id);assert(r,b.id);assert.equal(r.name,b.name);assert(r.basePersons>0);
 const file=r.photo||(photos[r.id]?'photos/'+photos[r.id]+'.webp':null);assert(file,'geen foto voor '+r.id);assert(fs.statSync(path.join(root,file)).size>1000,file);
 if(r.source==='Bekkari')assert.equal(r.photo,'photos/bekkari-'+r.id+'.webp');if(r.source==='Batali')assert.equal(r.photo,'photos/batali-'+r.id+'.webp');if(r.source==='24Kitchen'||r.source==='Loveland')assert(!r.photo&&photos[r.id]);}
console.log('PASS: 80 boekrecepten met basePersons en een foto (Bekkari eigen foto, 24Kitchen en Loveland Pexels-voorbeeld)');
