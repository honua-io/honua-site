from pathlib import Path
root = Path.cwd()
p = root/'scripts/capability-page-shell.mjs'
s = p.read_text()
assert 'normalizeCapabilityMetadata' not in s
s = s.replace('  return `<!doctype html>', '  return normalizeCapabilityMetadata(`<!doctype html>').replace('\n`;\n}', '\n`);\n}')
s += '''
// Match the site's canonical metadata contract without changing page content.
export function normalizeCapabilityMetadata(html) {
  return html.replace(/<head>([\\s\\S]*?)<\\/head>/i, (_match, head) => {
    const attrs = tag => Object.fromEntries([...tag.matchAll(/([\\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    head = head.replace(/<meta\\b[^>]*>/gi, tag => {
      const a = attrs(tag);
      const kind = a.name ? 'name' : a.property ? 'property' : a['http-equiv'] ? 'http-equiv' : null;
      if (kind) return `<meta ${kind}="${a[kind]}" content="${a.content ?? ''}" />`;
      return tag.replace(/\\/?>(?=$)/, ' />');
    }).replace(/<link\\b[^>]*>/gi, tag => {
      const a = attrs(tag);
      return a.rel === 'canonical' ? `<link rel="canonical" href="${a.href}" />` : tag;
    });
    const title = head.match(/<title>([\\s\\S]*?)<\\/title>/i)?.[1] || 'Honua';
    const description = head.match(/<meta name="description" content="([^"]*)"/i)?.[1] || '';
    const image = 'https://honua.io/assets/og-image.png';
    const alt = 'Honua social preview: Open geospatial infrastructure. One server. Open standards. Your cloud.';
    for (const [kind,key,value] of [
      ['property','og:description',description], ['property','og:site_name','Honua'],
      ['property','og:image:alt',alt], ['property','og:image:width','1200'], ['property','og:image:height','630'],
      ['name','twitter:title',title], ['name','twitter:description',description],
      ['name','twitter:image',image], ['name','twitter:image:alt',alt],
    ]) if (!head.includes(`${kind}="${key}"`)) head += `\\n<meta ${kind}="${key}" content="${value}" />`;
    return '<head>' + head + '</head>';
  });
}
'''
p.write_text(s)
p = root/'scripts/gen-capability-catalog.mjs'
s = p.read_text()
assert 'normalizeCapabilityMetadata' not in s
s = s.replace('import { readFileSync, writeFileSync, readdirSync } from "node:fs";', 'import { readFileSync, writeFileSync, readdirSync } from "node:fs";\nimport { normalizeCapabilityMetadata } from "./capability-page-shell.mjs";')
s = s.replace('const nextPage = before + renderHub(policy) + after;', 'const nextPage = normalizeCapabilityMetadata(before + renderHub(policy) + after);')
assert 'const nextPage = normalizeCapabilityMetadata' in s
needle = '// 2. Per-capability L2 evidence pages.'
assert needle in s
s = s.replace(needle, '''const installPath = join(repoRoot, "install-with-agent.html");
const installPage = readFileSync(installPath, "utf8");
const normalizedInstall = normalizeCapabilityMetadata(installPage);
if (check) {
  if (installPage !== normalizedInstall) mismatches.push("install-with-agent.html metadata is out of date");
} else if (installPage !== normalizedInstall) writeFileSync(installPath, normalizedInstall);

''' + needle)
p.write_text(s)
p = root/'scripts/capability-hub.test.mjs'
s = p.read_text() + '''
test('Capability pages include complete canonical and social metadata', () => {
  for (const name of ['capabilities.html','capability-details.html','install-with-agent.html']) {
    const page = read(name);
    assert.ok(page.includes(`<link rel="canonical" href="https://honua.io/${name}" />`));
    assert.ok(page.includes(`<meta property="og:url" content="https://honua.io/${name}" />`));
    for (const key of ['og:description','og:image:alt','og:image:width','og:image:height']) assert.ok(page.includes(`property="${key}"`));
    for (const key of ['twitter:title','twitter:description','twitter:image','twitter:image:alt']) assert.ok(page.includes(`name="${key}"`));
    assert.ok(page.includes('property="og:image:width" content="1200"'));
    assert.ok(page.includes('property="og:image:height" content="630"'));
  }
});
'''
p.write_text(s)
