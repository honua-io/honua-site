#!/usr/bin/env node
// Real HTTP browser checks. Uses the runner's Chrome and Node's built-in WebSocket.
import { spawn } from 'node:child_process';
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
    await sleep(100);
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
  await load('architecture.html'); await capture('architecture-overview');
  await load('architecture.html#overview');
  assert.equal(await evaluate('document.querySelector("#overview").hidden'),false);
  await evaluate('document.querySelector("[data-trace-request]").click()'); await sleep(250);
  assert.equal(await evaluate('document.querySelector("[data-trace-request]").getAttribute("aria-pressed")'),'true');
  await capture('architecture-request');
  await evaluate('document.querySelector("[data-trace-request]").click()');
  await load('architecture.html#deployment');
  assert.equal(await evaluate('document.querySelector("#topology-choice")'),null);
  assert.equal(await evaluate('[...document.querySelectorAll("[data-runtime-option]")].filter(e=>e.getClientRects().length).length'),3);
  assert.equal(await evaluate('document.querySelectorAll("[data-architecture-tab]").length'),5);
  await capture('architecture-deployment');
  await load('architecture.html#ops');
  await evaluate('document.querySelectorAll("#ops [data-step-target]")[2].click()');
  assert.equal(await evaluate('document.querySelectorAll("#ops [data-step-target]")[2].getAttribute("aria-selected")'),'true');
  await capture('architecture-operations');
  await load('architecture.html#aws',390,1800); await capture('architecture-aws-mobile');
  await load('capabilities.html'); await capture('capabilities-desktop');
  assert.equal(await evaluate('document.querySelectorAll("#workflows .hub-card").length'),12);
  assert.equal(await evaluate('document.querySelectorAll("#group-geoservices-rest [data-hub-item]").length'),13);
  assert.equal(await evaluate('document.querySelectorAll("#group-geoservices-rest details").length'),0);
  assert.equal(await evaluate('document.querySelectorAll("#formats .hub-format").length'),6);
  // Pass browser input as CDP data, never interpolate it into executable code.
  async function callWithValue(functionDeclaration, value) {
    const remote=await send('Runtime.evaluate',{expression:'window'});
    const objectId=remote.result.objectId;
    assert.ok(objectId,'Browser global object is available');
    try {
      const outcome=await send('Runtime.callFunctionOn',{
        objectId,functionDeclaration,arguments:[{value}],awaitPromise:true,returnByValue:true,
      });
      if(outcome.exceptionDetails) throw new Error(JSON.stringify(outcome.exceptionDetails));
      return outcome.result.value;
    } finally { await send('Runtime.releaseObject',{objectId}); }
  }
  async function sectionCapture(id, name) {
    await callWithValue('function(id) { document.getElementById(id).scrollIntoView({block:"start",behavior:"instant"}); return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }',id);
    // Wait for normal browser painting and reveal transitions, not virtual-time screenshots.
    await sleep(700);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,'Section viewport overflow');
    const visible=await callWithValue('function(id) { const e=document.getElementById(id),r=e.getBoundingClientRect(),s=getComputedStyle(e);return !e.hidden && r.bottom>0 && r.top<innerHeight && s.display!=="none" && s.visibility!=="hidden" && Number(s.opacity)>0; }',id);
    assert.ok(visible,`Section ${id} must be visible before capture`);
    const image=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    await writeFile(`review-screenshots/${name}.png`,Buffer.from(image.data,'base64'));
  }
  await sectionCapture('standards','capabilities-geoservices');
  await sectionCapture('formats','capabilities-formats');
  async function search(query) {
    await callWithValue('function(query) { const input=document.getElementById("hub-search"); input.value=query; input.dispatchEvent(new Event("input",{bubbles:true})); }',query);
  }
  await search('GPServer');
  assert.equal(await evaluate('document.getElementById("group-geoservices-rest").hidden'),false);
  assert.equal(await evaluate(`document.querySelector('#group-geoservices-rest [data-capability-key="process.geoprocessing"]').hidden`),false);
  await search('GeoParquet');
  assert.equal(await evaluate('document.getElementById("format-cloud-vector").hidden'),false);
  await search('SQL Server');
  assert.equal(await evaluate('document.getElementById("databases").hidden'),false);
  await search('no-such-honua-capability-123');
  assert.ok((await evaluate('document.getElementById("hub-search-status").textContent')).includes('No matches'));
  assert.equal(await evaluate('[...document.querySelectorAll("#components,#workflows,#standards,#databases,#formats")].every(s=>s.hidden)'),true);
  await search('');
  assert.equal(await evaluate('[...document.querySelectorAll("[data-hub-card]")].every(c=>!c.hidden)'),true);
  await search('Collect');
  assert.equal(await evaluate('document.getElementById("component-collect").hidden'),false);
  assert.equal(await evaluate('document.getElementById("component-server").hidden'),true);
  await search('Python');
  assert.equal(await evaluate('document.getElementById("component-sdks").hidden'),false);
  await search('');
  await sectionCapture('components','platform-components');
  for(const width of [1024,768,390,320]) {
    await load('capabilities.html',width,1600);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,`Capabilities overflow at ${width}`);
  }
  await load('capabilities.html',390,1600);
  await capture('capabilities-mobile');
  await sectionCapture('group-geoservices-rest','capabilities-geoservices-mobile');
  await sectionCapture('component-mobile','field-components-mobile');
  await load('architecture.html#deployment',1440,1300);
  await sectionCapture('deployment','architecture-compute-detail');
  await load('architecture.html#ops',1440,1300);
  await sectionCapture('ops','architecture-operations-detail');
  await load('index.html',1440,1100);
  await sectionCapture('operate','homepage-operations-detail');
  assert.ok((await evaluate('document.querySelector("#operate").textContent')).includes('Make changes with confidence.'));
  // Deployment choices stay visible; cloud references retain their old URLs.
  for (const hash of ['aws', 'azure']) {
    await load('architecture.html#' + hash, 1440, 1400);
    assert.equal(await evaluate('document.getElementById("deployment").hidden'), false);
    assert.equal(await callWithValue('function(id) { return document.getElementById(id).open; }', hash), true);
    const top=await callWithValue('function(id) { return document.getElementById(id).getBoundingClientRect().top; }', hash);
    assert.ok(top>=0 && top<200, 'Cloud reference should be brought into view');
  }
  await load('architecture.html#topology-cluster');
  assert.equal(await evaluate('document.getElementById("deployment").hidden'), false);
  await evaluate('document.getElementById("architecture-tab-deployment").focus(); document.getElementById("architecture-tab-deployment").dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}));');
  assert.equal(await evaluate('document.activeElement.id'), 'architecture-tab-ops');
  await evaluate('location.hash="aws"'); await sleep(150);
  assert.equal(await evaluate('document.getElementById("deployment").hidden'), false);
  assert.equal(await evaluate('document.getElementById("aws").open'), true);
  await load('architecture.html#deployment',1440,1600);
  await sectionCapture('deployment','deployment-overview-desktop');
  await sectionCapture('deployment-cloud-title','deployment-cloud-comparison');
  for (const width of [1024,768,390,320]) {
    await load('architecture.html#deployment',width,1600);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,`Deployment overflow at ${width}`);
    assert.equal(await evaluate('[...document.querySelectorAll("[data-runtime-option]")].filter(e=>e.getClientRects().length).length'),3);
  }
  await load('architecture.html#deployment',390,1600);
  await sectionCapture('deployment','deployment-overview-mobile');
  for (const path of ['index.html','capabilities.html','architecture.html','blog.html','editions.html','blog-ai-mapmaking.html']) {
    await load(path,1440,1200);
    assert.equal(await evaluate('[...document.querySelectorAll("h1, h1 > span")].every(e=>getComputedStyle(e).color!=="rgb(196, 238, 157)")'),true,'Neutral page heading: '+path);
  }
  await load('index.html',1440,1100); await capture('homepage-neutral-desktop');
  await load('index.html',390,1200); await capture('homepage-neutral-mobile');
  await load('capabilities.html',1440,1500); await capture('capabilities-neutral-desktop');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Capability sections"] a[href="#group-geoservices-rest"]')`),null);
  await load('install-with-agent.html'); await capture('agent-install');
  console.log('Real browser architecture, platform search, and layout checks passed.');
} finally {
  for(const request of pending.values()) clearTimeout(request.timeout);
  socket?.close(); browser.kill('SIGTERM');
  await sleep(300); await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
