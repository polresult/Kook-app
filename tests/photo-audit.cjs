const fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const recipes=JSON.parse(html.match(/const R=(\[.*?\]);/s)[1]);
const odrva=recipes.filter(r=>r.source==='ODRVA');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'ODRVA-SCREENSHOTS.json')));
const audit=JSON.parse(fs.readFileSync(path.join(root,'ODRVA-PHOTO-AUDIT.json')));
assert.equal(odrva.length,101);assert(!recipes.some(r=>r.id===268));assert.equal(manifest.count,odrva.length);
assert.equal(manifest.count,101);
assert.equal(new Set(manifest.screenshots.map(p=>p.id)).size,manifest.count);
assert.equal(audit.totalRecipes,odrva.length);
assert.deepEqual(audit.missing,[]);
for(const p of manifest.screenshots){
 const r=odrva.find(r=>r.id===p.id);assert(r,p.id+' has no ODRVA recipe');
 assert.equal(r.photo,p.file);assert(fs.statSync(path.join(root,p.file)).size>1000,p.file);
 assert.equal(r.screenshotSourceUrl,p.sourceUrl);assert.equal(r.screenshotTimeSeconds,p.timeSeconds);
 assert(p.fingersReviewed);assert.strictEqual(p.fingersVisible,false);
 assert(p.sourceUrl.startsWith('https://www.instagram.com/'));
 if(p.kind==='retouched-original-video-frame')assert.equal(r.photoCaption,p.photoCaption);
}
const captions=new Set(odrva.map(r=>r.photoCaption).filter(v=>v!==undefined));
assert(captions.has('')&&captions.has('All organic.')&&captions.has('Naturally.')&&captions.size>=5);
assert(html.includes('aria-hidden="true">${esc(r.photoCaption)}'));
console.log('PASS: 101 linked assets, source/timestamp provenance, finger-review records, captions and full recipe photo coverage');
