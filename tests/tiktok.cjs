// TikTok recipes in the app, and the server inbox where users hand in TikTok links.
const fs=require('fs'),assert=require('assert'),path=require('path'),os=require('os'),http=require('http'),{spawn}=require('child_process');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const recipes=JSON.parse(html.match(/const R=(\[.*?\]);/s)[1]);
const tt=recipes.filter(r=>r.source==='TikTok');
const batch=fs.existsSync(path.join(root,'TIKTOK-BATCH.json'))?JSON.parse(fs.readFileSync(path.join(root,'TIKTOK-BATCH.json'))):{recipes:[]};
assert(/const TT_SKIP=\{.*?\};/.test(html));
assert.equal(new Set(recipes.map(r=>r.id)).size,recipes.length);
assert.equal(batch.recipes.length,tt.length);
const vid=u=>(/\/video\/(\d+)/.exec(u)||[])[1];
assert.equal(new Set(tt.map(r=>vid(r.sourceUrl))).size,tt.length);
for(const r of tt){assert(r.id>=3000);assert(vid(r.sourceUrl));assert.equal(r.photo,`photos/tiktok-${r.id}.webp`);assert(fs.statSync(path.join(root,r.photo)).size>1000);assert(r.basePersons>0);assert(r.ingredients.length>=2&&r.steps.length>=2);assert(batch.recipes.some(b=>b.id===r.id&&b.sourceUrl===r.sourceUrl));}

const port=3391,data=fs.mkdtempSync(path.join(os.tmpdir(),'kook-tt-'));
const call=(p,method='GET',body,token)=>new Promise((resolve,reject)=>{const req=http.request({port,path:'/api/'+p,method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(d||'{}')}))});req.on('error',reject);req.end(body?JSON.stringify(body):undefined)});
(async()=>{
  const srv=spawn(process.execPath,[path.join(root,'server.js')],{env:{...process.env,PORT:port,DATA_DIR:data},stdio:'ignore'});
  try{
    for(let i=0;i<50;i++){try{await call('ping');break}catch(e){await new Promise(r=>setTimeout(r,100))}}
    const a=(await call('register','POST',{name:'Anna',pin:'1234'})).body.token,b=(await call('register','POST',{name:'Bram',pin:'1234'})).body.token;
    const link='https://www.tiktok.com/@kok/video/7123456789012345678';
    assert.equal((await call('inbox','POST',{url:link})).status,401);
    assert.equal((await call('inbox','POST',{url:'https://example.com/video/1'},a)).status,400);
    // a share from the TikTok app: a sentence, the link and tracking parameters
    let r=await call('inbox','POST',{url:'Kijk dit! '+link+'?_r=1&is_from_webapp=1 #lekker'},a);
    assert.equal(r.status,200);assert.equal(r.body.items.length,1);assert.equal(r.body.items[0].url,link);assert.equal(r.body.items[0].videoId,'7123456789012345678');assert.equal(r.body.items[0].handle,'kok');
    r=await call('inbox','POST',{url:link},a);assert.equal(r.body.known,true);assert.equal(r.body.items.length,1);
    await call('inbox','POST',{url:link},b);
    r=await call('inbox/pending');assert.equal(r.body.items.length,1);assert.deepEqual(Object.keys(r.body.items[0]).sort(),['at','handle','url','videoId']);
    r=await call('inbox/remove','POST',{id:(await call('inbox','GET',null,a)).body.items[0].id},a);assert.equal(r.body.items.length,0);
    assert.equal((await call('inbox','GET',null,b)).body.items.length,1);
    await call('inbox/remove','POST',{id:(await call('inbox','GET',null,b)).body.items[0].id},b);
    assert.equal((await call('inbox/pending')).body.items.length,0);
    console.log(`PASS: ${tt.length} TikTok-recept(en) met foto en bron, wachtrij voor TikTok-links (doorgeven, dubbel, verwijderen)`);
  }finally{srv.kill();fs.rmSync(data,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exit(1)});
