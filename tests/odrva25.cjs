const fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.join(__dirname,'..');
const recipes=JSON.parse(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/const R=(\[.*?\]);/s)[1]);
const batch=JSON.parse(fs.readFileSync(path.join(root,'ODRVA-BATCH-25.json')));
const shots=JSON.parse(fs.readFileSync(path.join(root,'ODRVA-SCREENSHOTS.json')));
assert.equal(batch.recipes.length,25);assert.equal(recipes.length,351);assert.equal(shots.count,75);
for(const r of batch.recipes)assert.equal(recipes.filter(x=>x.sourceUrl===r.sourceUrl).length,1);
for(const r of batch.recipes){const app=recipes.find(x=>x.id===r.id);assert(app);assert.equal(app.photo,r.photo);assert.equal(app.sourceUrl,r.screenshotSourceUrl);assert(r.sourceCaption.length>20);assert(r.steps.length>=2);assert(fs.statSync(path.join(root,r.photo)).size>1000);for(const i of r.ingredients)assert(Number.isFinite(i[1])&&i[1]>0);for(const n of r.estimatedIngredients)assert(r.sourceIngredients.find(i=>i[0]===n)[1]===null);assert(shots.screenshots.some(s=>s.id===r.id&&s.sourceUrl===r.sourceUrl));}
console.log('PASS: 25 unique sources, caption provenance, source/estimated quantities, recipe links and 75 photo assets');

