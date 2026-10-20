#!/usr/bin/env node
// Real HTTP browser checks. Uses the runner's Chrome and Node's built-in WebSocket.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const origin = process.argv[2] || 'http://127.0.0.1:8765';
const base = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Review browser must use a local build.');
const profile = await mkdtemp(join(tmpdir(), 'honua-browser-'));
const browser = spawn(process.env.CHROME_PATH || 'google-chrome', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], { stdio: 'ignore' });
let socket;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
let sequence = 0;
try {
  let port;
  for (let attempt=0; attempt<100; attempt++) {
    try { port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]; break; } catch { await sleep(100); }
  }
  if (!port) throw new Error('Chrome debugging port did not start.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(t => t.type === 'page');
  if (!target) throw new Error('Chrome has no review page.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const response = JSON.parse(event.data);
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id); clearTimeout(request.timeout);
    if (response.error) request.reject(new Error(JSON.stringify(response.error))); else request.resolve(response.result);
  });
  await new Promise((resolve,reject) => { socket.addEventListener('open',resolve,{once:true}); socket.addEventListener('error',reject,{once:true}); });
  const send = (method,params={}) => new Promise((resolve,reject) => {
    const id=++sequence;
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`Timeout: ${method}`));},20000);
    pending.set(id,{resolve,reject,timeout}); socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async expression => {
    const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
    return value.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await mkdir('review-screenshots',{recursive:true});
  async function load(path,width=1440,height=1600) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const response=await send('Page.navigate',{url:new URL(path,base).href});
    if (response.errorText) throw new Error(response.errorText);
    for (let attempt=0;attempt<100;attempt++) {
      if (await evaluate(`location.href===${JSON.stringify(new URL(path,base).href)} && document.readyState==='complete'`)) break;
      if(attempt===99) throw new Error(`Page did not load: ${path}`);
      await sleep(100);
    }
    await evaluate('document.fonts.ready.then(()=>true)');
    // Use the real decline action in the isolated review profile; production consent is unchanged.
    await evaluate('document.querySelector("[data-cookie-decline]")?.click()');
    await sleep(30);
  }
  async function capture(name) {
    // A fragment can scroll before first paint; reset and await composition before capture.
    await evaluate('scrollTo({top:0,left:0,behavior:"instant"}); new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    await sleep(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,'Viewport overflow');
    const heading=await evaluate(`(()=>{const h=document.querySelector('h1'); const s=getComputedStyle(h); return {text:h.textContent,top:h.getBoundingClientRect().top,visibility:s.visibility,display:s.display};})()`);
    assert.ok(heading.top>=0 && heading.top<900, 'Main heading must be in the initial viewport');
    assert.notEqual(heading.visibility,'hidden'); assert.notEqual(heading.display,'none');
    const image=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    await writeFile(`review-screenshots/${name}.png`,Buffer.from(image.data,'base64'));
    console.log(`${name}: visible heading; no overflow`);
  }
  // Every independently styled first-party page; immutable SDK demos are excluded.
  const paths = readdirSync(new URL('../', import.meta.url)).filter(path => {
    if (!path.endsWith('.html')) return false;
    const html = readFileSync(new URL('../'+path,import.meta.url),'utf8');
    return /<main\b/.test(html) && !/http-equiv=["']refresh/i.test(html) && /(?:styles\.css|assets\/(?:remodel|learning-hub)\.css)/.test(html);
  }).sort();
  const featured = new Set(['index.html','capabilities.html','architecture.html','editions.html','compare-editions.html','blog.html','blog-ai-mapmaking.html','install-with-agent.html','ai-gis.html','migration.html','security.html','docs.html']);
  const report=[];
  for (const width of [1440,390]) {
    for (const path of paths) {
      await load(path,width,1100);
      await evaluate(`document.querySelectorAll('#honua-cookie-banner button').forEach(b=>{if(b.textContent.trim()==='Decline')b.click();})`);
      const state=await evaluate(`(()=>{
        const rgb=v=>{const n=v.match(/[\\d.]+/g);return n?n.map(Number):[0,0,0,0];};
        const blend=(top,under)=>{const a=top.length>3?top[3]:1;return top.slice(0,3).map((v,i)=>v*a+under[i]*(1-a));};
        function background(e){if(!e)return [8,19,26];const c=rgb(getComputedStyle(e).backgroundColor);return blend(c,background(e.parentElement));}
        function luminance(c){const a=c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*a[0]+.7152*a[1]+.0722*a[2];}
        function contrast(e){const fg=luminance(rgb(getComputedStyle(e).color).slice(0,3)),bg=luminance(background(e));return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);}
        const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
        const actions=[...document.querySelectorAll('.h-button:not(.h-button-secondary),.btn-primary,.nav-cta,.hub-button.primary')].filter(visible).map(e=>({text:e.textContent.trim(),ratio:contrast(e)}));
        return {background:getComputedStyle(document.body).backgroundColor,token:getComputedStyle(document.body).getPropertyValue('--honua-bg').trim(),overflow:document.documentElement.scrollWidth>innerWidth+1,actions,headingColors:[...document.querySelectorAll('h1,h1>span,h2,h2>span')].filter(visible).map(e=>getComputedStyle(e).color)};
      })()`);
      report.push({path,width,...state});
      assert.equal(state.background,'rgb(8, 19, 26)',`${path}: shared page background`);
      assert.equal(state.token,'#08131a',`${path}: theme file loaded`);
      assert.equal(state.overflow,false,`${path} overflows at ${width}`);
      for(const action of state.actions) assert.ok(action.ratio>=4.5,`${path} ${width} ${action.text}: action contrast ${action.ratio.toFixed(2)}`);
      assert.ok(!state.headingColors.includes('rgb(196, 238, 157)'),`${path}: stale lime heading`);
      if(featured.has(path)) {
        const image=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
        await writeFile(`review-screenshots/palette-${path.replace('.html','')}-${width}.png`,Buffer.from(image.data,'base64'));
      }
    }
  }
  // Focus and mobile navigation on both marketing design systems.
  for(const path of ['index.html','ai-gis.html']) {
    await load(path,390,1100);
    await evaluate(`document.querySelectorAll('#honua-cookie-banner button').forEach(b=>{if(b.textContent.trim()==='Decline')b.click();})`);
    await evaluate('document.querySelector(".nav-toggle").click()');
    assert.equal(await evaluate('document.querySelector(".nav-toggle").getAttribute("aria-expanded")'),'true');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);
    await evaluate('document.querySelector(".nav-toggle").click()');
    assert.equal(await evaluate('document.querySelector(".nav-toggle").getAttribute("aria-expanded")'),'false');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'none');
  }
  for(const path of ['index.html','capabilities.html','architecture.html','editions.html','install-with-agent.html']) {
    await load(path,320,1100);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,path+' at 320px');
  }
  await writeFile('review-screenshots/palette-audit.json',JSON.stringify({pageCount:paths.length,viewports:[1440,390],results:report},null,2)+'\n');
  console.log(`Shared palette and action contrast passed on ${paths.length} pages at desktop and mobile widths.`);
} finally {
  for(const request of pending.values()) clearTimeout(request.timeout);
  socket?.close(); browser.kill('SIGTERM');
  await sleep(300); await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
