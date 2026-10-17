// Real Chromium layout/navigation checks with controlled authentication API responses.
// No production database, credentials, or application records are used.
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const root = path.resolve('frontend');
const calls=[]; let server, browser;
const results=[];
async function check(name, fn) { await fn(); results.push(name); console.log('PASS', name); }
(async()=>{
server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://test');
 if(url.pathname.startsWith('/api/v1/')){
  calls.push({path:url.pathname,token:req.headers.authorization});res.setHeader('Content-Type','application/json');
  if(url.pathname==='/api/v1/auth/login'){
   let body='';req.on('data',b=>body+=b);req.on('end',()=>{const a=JSON.parse(body); const role=a.email.startsWith('public')?5:3;res.end(JSON.stringify({token:'role-'+role,user:{role_id:role,full_name:'Browser Staff'}}));}); return;
  }
  const role=Number((req.headers.authorization||'').replace('Bearer role-',''));
  if(![1,2,3,5].includes(role)){res.statusCode=401;return res.end(JSON.stringify({message:'No valid session'}));}
  if(url.pathname==='/api/v1/auth/me') return res.end(JSON.stringify({data:{role_id:role,full_name:'Browser Staff'}}));
  return res.end(JSON.stringify({data:[]}));
 }
 const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const tools=path.resolve(process.env.PACFAS_BROWSER_TOOLS || '.cache/ui-check/node_modules');
const {default: binary,inflate,setupLambdaEnvironment}=await import(path.join(tools,'@sparticuz/chromium/build/index.js'));
await inflate(path.join(tools,'@sparticuz/chromium/bin/al2023.tar.br'));setupLambdaEnvironment('/tmp/al2023/lib');
const {chromium}=require(path.join(tools,'playwright-core'));
browser=await chromium.launch({executablePath:await binary.executablePath(),args:binary.args.filter(a=>!['--disable-web-security','--allow-running-insecure-content'].includes(a)),headless:true});
async function page(token){const ctx=await browser.newContext({viewport:{width:1366,height:768}});await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());if(token)await ctx.addInitScript(t=>localStorage.setItem('jwtToken',t),token);return {ctx,p:await ctx.newPage()};}
let {ctx,p}=await page();
await check('Staff Login opens a centered fixed overlay, not bottom-of-page content',async()=>{await p.goto(base);await p.locator('#openLoginBtn').click();const box=await p.locator('#loginModal .modal-content').boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=768);assert.ok(Math.abs(box.x+box.width/2-683)<2);assert.equal(await p.locator('#loginEmail').evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Escape');await p.locator('#loginModal').waitFor({state:'hidden'});});
await check('Anonymous Workspace click opens login without entering dashboard',async()=>{await p.locator('a[href="dashboard.html"]').click();assert.equal(new URL(p.url()).pathname,'/');await p.locator('#loginModal').waitFor({state:'visible'});});
await check('Direct anonymous dashboard and every restricted page redirect with login shown',async()=>{for(const file of ['dashboard','clients','admin','case-details']){calls.length=0;await p.goto(base+'/'+file+'.html');await p.waitForURL('**/index.html?login=1');await p.locator('#loginModal').waitFor({state:'visible'});assert.equal(calls.filter(c=>!c.path.includes('/attorneys')).length,0);}});
await check('Successful staff login shows verified identity and logout clears session',async()=>{await p.locator('#loginEmail').fill('staff@example.test');await p.locator('#loginPassword').fill('fixture-password');await p.locator('#loginForm button[type="submit"]').click();await p.waitForURL('**/dashboard.html');await p.locator('#userDisplayName').filter({hasText:'Browser Staff'}).waitFor();assert.equal(await p.locator('body').isVisible(),true);await p.locator('#logoutBtn').click();await p.waitForURL('**/index.html');assert.equal(await p.evaluate(()=>localStorage.getItem('jwtToken')),null);});
await check('Public role cannot authenticate through Staff Login',async()=>{await p.locator('#openLoginBtn').click();await p.locator('#loginEmail').fill('public@example.test');await p.locator('#loginPassword').fill('fixture-password');await p.locator('#loginForm button[type="submit"]').click();await p.locator('#loginError').filter({hasText:'restricted'}).waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('jwtToken')),null);});
await check('Modal fits a narrow mobile viewport',async()=>{await p.setViewportSize({width:390,height:844});const box=await p.locator('#loginModal .modal-content').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);assert.ok(box.y>=0&&box.y+box.height<=844);});

for(const [token,pageName,expected] of [['expired','dashboard','index.html?login=1&reason=session'],['role-5','dashboard','index.html?login=1&reason=staff'],['role-2','clients','dashboard.html'],['role-3','admin','dashboard.html']]){
 const item=await page(token);p=item.p;await check(`${token}: ${pageName} redirects to allowed destination`,async()=>{await p.goto(base+'/'+pageName+'.html');await p.waitForURL(base+'/'+expected);if(token==='expired')assert.equal(await p.evaluate(()=>localStorage.getItem('jwtToken')),null);});
}
console.log('Browser:',browser.version(),'Checks:',results.length,'(controlled authentication API; real frontend and Chromium, no production DB)');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
