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
