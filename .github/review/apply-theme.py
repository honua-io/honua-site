from pathlib import Path
import re
root=Path.cwd()
palette='''/* Shared Honua palette. The AI GIS page is the visual reference.
   Layout-specific styles consume these tokens; demos retain their own styling. */
:root {
  --honua-bg: #08131a;
  --honua-surface: #0e1e27;
  --honua-surface-2: #162a34;
  --honua-surface-3: #1f3a47;
  --honua-line: #22343f;
  --honua-line-soft: #172730;
  --honua-text: #e6efee;
  --honua-muted: #8ea7a6;
  --honua-faint: #7f999a;
  --honua-teal: #3aa088;
  --honua-teal-bright: #5fc4a6;
  --honua-blue: #5fa1cc;
  --honua-blue-bright: #85c9f4;
  --honua-blue-deep: #3a7aa0;
  --honua-amber: #d9824a;
  --honua-amber-bright: #f2aa78;
  --honua-cream: #e9efed;
  --honua-danger: #f29c95;
  --honua-on-accent: #04151a;
  --bed-bg: var(--honua-bg);
  --bed-surface: var(--honua-surface);
  --bed-surface-2: var(--honua-surface-2);
  --bed-surface-3: var(--honua-surface-3);
  --bed-rule: var(--honua-line);
  --bed-rule-soft: var(--honua-line-soft);
  --bed-text: var(--honua-text);
  --bed-text-dim: var(--honua-muted);
  --bed-text-faint: var(--honua-faint);
  --bed-teal: var(--honua-teal);
  --bed-teal-bright: var(--honua-teal-bright);
  --bed-blue: var(--honua-blue);
  --bed-blue-bright: var(--honua-blue-bright);
  --bed-blue-deep: var(--honua-blue-deep);
  --bed-amber: var(--honua-amber);
  --bed-amber-bright: var(--honua-amber-bright);
  --bed-cream: var(--honua-cream);
}
'''
(root/'assets/theme.css').write_text(palette)
s=(root/'styles.css').read_text()
assert '--bed-bg: #08131a;' in s
s=re.sub(r':root\s*\{[^}]*--bed-bg:[^}]*\}\s*','',s,count=1)
s='@import url("assets/theme.css");\n'+s
(root/'styles.css').write_text(s)
p=root/'assets/remodel.css';s=p.read_text()
tokens={'bg':'bg','surface':'surface','ink':'text','muted':'muted','line':'line','accent':'teal-bright','teal':'blue','paper':'surface','dark':'bg'}
for k,v in tokens.items():
 s,n=re.subn(r'--h-'+k+r':#[a-f0-9]+',f'--h-{k}:var(--honua-{v})',s,count=1);assert n==1,k
s='@import url("theme.css");\n'+s
s=re.sub(r'\.h-light\{[^}]+\}', '.h-light{background:var(--honua-surface);color:var(--h-ink);--h-surface:var(--honua-bg);color-scheme:dark}',s,count=1)
s=re.sub(r'\.h-control\{[^}]+\}', '.h-control{background:var(--honua-surface-2);color:var(--honua-text)}',s,count=1)
s=s.replace('.h-hero h1>span,.h-page-hero h1>span{color:inherit}', '.h-hero h1>span,.h-page-hero h1>span{color:var(--honua-teal)}')
s=s.replace('.h-control h2 em{font-style:normal;color:inherit}', '.h-control h2 em{font-style:normal;color:var(--honua-teal-bright)}')
groups={
 'bg':['102522','102121','122820','16332c','223e30','18312b','0e2521','102120','102524','153027','122624','112524','122a27','132c28','142b26','112724','142c26','122b26','102925'],
 'surface':['163330','18382f','1d4035','19332c','15312a','18342e','1c3830','1a3a2c'],
 'surface-2':['1b3c30','19382c','dce7d6','d9e7e2','e6e4d8','c0dbb3','e3e9dc'],
 'line':['3c6055','3e5b52','94b392','c2d2bd','a8b9ac'],
 'surface-3':['5a706a','729566','597959','527a53','537866','8aa78b'],
 'text':['d3e0d8','c6dace','d2e4d8','cfe0c4','bed4c9','d8e6dc','c0d0c6','c0d3c7'],
 'muted':['849c91','abc5b4','adc6b7','607d71','58715f','345c47','829c91','516c5b','435e4c','638b75','677b6e'],
 'teal':['51836b','86b17a','80a777','4b784a'],
 'teal-bright':['c4ee9d','537947','527348','376b62','34593c','63945c'],
 'blue':['716d44','7aa76b'],
 'blue-bright':['e0fbbd'],
 'on-accent':['17302b'],
}
maphex={c:'var(--honua-'+t+')' for t,cs in groups.items() for c in cs}
maphex.update({'d6f4bb':'var(--honua-teal-bright)','193d2f':'var(--honua-text)','0b251ddb':'#08131adb','1e45300b':'#08131a0b','68876115':'#5fa1cc15'})
s=re.sub(r'#([0-9a-fA-F]{3,8})\b',lambda m:maphex.get(m[1].lower(),m[0]),s)
s=s.replace('border:1px solid var(--h-accent);background:var(--h-accent);color:var(--honua-on-accent)', 'border:1px solid var(--honua-teal);background:var(--honua-teal);color:var(--honua-on-accent)')
s=s.replace('background:#fff;color:var(--honua-text)', 'background:var(--honua-bg);color:var(--honua-text)')
p.write_text(s)
p=root/'assets/capability-hub.css';s=p.read_text()
cols={'cdd7cd':'line','fffefa':'bg','465d51':'muted','3b6555':'teal-bright','775422':'amber-bright','c9b892':'amber','475f53':'muted'}
s=re.sub(r'#([0-9a-f]+)\b',lambda m:'var(--honua-'+cols[m[1]]+')' if m[1] in cols else m[0],s)
p.write_text(s)
p=root/'assets/editions.css';s=p.read_text().replace('var(--h-text)','var(--h-ink)')
s=s.replace('color:#f0f5e7','color:var(--honua-on-accent)');p.write_text(s)
p=root/'assets/architecture-explorer.css';s=p.read_text()
s=s.replace('--bed-surface-2:#1c3632','--bed-surface-2:var(--honua-surface-2)').replace('--bed-amber:#e8c884','--bed-amber:var(--honua-amber-bright)')
s=s.replace('--bed-teal:var(--h-teal)','--bed-teal:var(--honua-teal)')
s=s.replace('.arch-page .teal { color: inherit; }','.arch-page .teal { color: var(--honua-teal); }')
p.write_text(s)
p=root/'assets/learning-hub.css';s=p.read_text()
variables={'paper':'bg','paper-bright':'surface','ink':'text','muted':'muted','line':'line','green':'teal-bright','green-dark':'teal','red':'danger','yellow':'amber-bright','night':'bg','night-panel':'surface','night-line':'line','night-ink':'text','night-muted':'muted','cyan':'blue-bright','lime':'teal-bright'}
for k,v in variables.items():
 s,n=re.subn(r'--'+k+r': #[a-f0-9]+;',f'--{k}: var(--honua-{v});',s,count=1);assert n==1,k
s='@import url("theme.css");\n'+s
s=s.replace('rgba(251, 248, 237, .76)','var(--honua-surface)').replace('rgba(15, 41, 42, .92)','var(--honua-surface)').replace('rgba(8, 25, 27, .78)','var(--honua-bg)')
s=s.replace('rgba(240, 196, 78, .18)','rgba(58, 160, 136, .12)')
s=s.replace('#071315','var(--honua-bg)').replace('#c7d7d1','var(--honua-text)').replace('#67847b','var(--honua-muted)').replace('#d4d1c3','var(--honua-line)')
s=s.replace('.theme-night .hub-button.primary { border-color: var(--red); background: var(--red); color: #1c0c08; }', '.hub-button.primary, .theme-night .hub-button.primary { border-color: var(--honua-teal); background: var(--honua-teal); color: var(--honua-on-accent); }')
s=s.replace('.release-state.supported { color: var(--green); background: #edf8f2; }','.release-state.supported { color: var(--honua-teal-bright); background: var(--honua-surface-2); }')
s=s.replace('.release-state.preview { color: #8a5a00; background: #fff6dd; }','.release-state.preview { color: var(--honua-amber-bright); background: var(--honua-surface-2); }')
s=s.replace('.release-state.planned { color: #395e70; background: #edf6fa; }','.release-state.planned { color: var(--honua-blue-bright); background: var(--honua-surface-2); }')
s=s.replace('.release-state.blocked { color: #9f3030; background: #fff0ed; }','.release-state.blocked { color: var(--honua-danger); background: var(--honua-surface-2); }')
s=s.replace('color: var(--ink);\n  background-color: var(--paper);','color: var(--ink);\n  color-scheme: dark;\n  background-color: var(--paper);')
p.write_text(s)
p=root/'assets/slice.css';s=p.read_text().replace('#071315','var(--honua-bg)').replace('#c7d7d1','var(--honua-text)');p.write_text(s)
p=root/'scripts/deployment-presentation.test.mjs';s=p.read_text()
s=s.replace("'Service migration'", "'Migration'")
s=s.replace('Large headings use neutral text without removing actionable green accents','Heading emphasis and actions use the shared ocean palette')
s=s.replace('.h-hero h1>span,.h-page-hero h1>span{color:inherit}', '.h-hero h1>span,.h-page-hero h1>span{color:var(--honua-teal)}')
s=s.replace('.h-control h2 em{font-style:normal;color:inherit}', '.h-control h2 em{font-style:normal;color:var(--honua-teal-bright)}')
s=s.replace('--h-accent:#c4ee9d', '--h-accent:var(--honua-teal-bright)')
s=s.replace('.arch-page .teal { color: inherit; }','.arch-page .teal { color: var(--honua-teal); }');p.write_text(s)
for name in ['docs.html','samples.html','demos.html','scripts/slice-template.mjs']:
 p=root/name;s=p.read_bytes().decode();s=s.replace('name="theme-color" content="#f3eedc"','name="theme-color" content="#08131a"').replace('name="theme-color" content="#08191b"','name="theme-color" content="#08131a"');p.write_bytes(s.encode())
p=root/'styles.css';p.write_text(p.read_text()+'\n/* Long source paths and configuration keys must not widen narrow pages. */\nmain :not(pre) > code { overflow-wrap: anywhere; }\n')
