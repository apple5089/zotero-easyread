"""Build a test-only Zotero profile and fixtures; does not open real libraries."""
from pathlib import Path
import json, zipfile

ROOT=Path(__file__).resolve().parents[1]
work=ROOT/'test-work'; profile=work/'profile'; data=work/'data'; home=work/'easyread-home'
for p in [profile/'extensions',data,home,work/'fixtures']: p.mkdir(parents=True,exist_ok=True)

def pdf(text):
    content=f'BT /F1 12 Tf 40 160 Td ({text}) Tj ET'.encode()
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(content)).encode()+b' >>\nstream\n'+content+b'\nendstream']
    raw=b'%PDF-1.4\n'; offsets=[0]
    for n,obj in enumerate(objects,1): offsets.append(len(raw)); raw+=f'{n} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(raw);raw+=b'xref\n0 6\n0000000000 65535 f \n'
    for offset in offsets[1:]:raw+=f'{offset:010} 00000 n \n'.encode()
    return raw+f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()

for name in ['alpha','beta']:(work/f'fixtures/{name}.pdf').write_bytes(pdf('TEST PAPER '+name.upper()))
(home/'config.json').write_text(json.dumps({'engine':'none','auto_translate':False,'check_updates':False}),encoding='utf-8')
prefs={'extensions.zotero.useDataDir':True,'extensions.zotero.dataDir':str(data),'extensions.zotero.firstRun2':False,
       'extensions.zotero.httpServer.enabled':True,'extensions.zotero.httpServer.port':23139,
       'extensions.zotero.sync.autoSync':False,'app.update.auto':False,'app.update.background.enabled':False,'extensions.autoDisableScopes':0,
       'extensions.enabledScopes':15,'extensions.zotero-easyread.home':str(home)}
(profile/'prefs.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k,v in prefs.items()),encoding='utf-8')
manifest=json.loads((ROOT/'zotero/manifest.json').read_text(encoding='utf-8'))
manifest['applications']['zotero']['id']='easyread-native-test@local.research'
manifest['name']='EasyRead integration test harness'
bootstrap=(ROOT/'zotero/bootstrap.js').read_text(encoding='utf-8')
bootstrap+='\nconst TEST_ROOT='+json.dumps(str(work))+';\n'
bootstrap+=(ROOT/'tests/native_harness.js').read_text(encoding='utf-8')
with zipfile.ZipFile(profile/'extensions/easyread-native-test@local.research.xpi','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json',json.dumps(manifest));z.writestr('bootstrap.js',bootstrap)
    for name in ['core.js','prefs.js','prefs.xhtml']:z.write(ROOT/'zotero'/name,name)
    z.writestr('bridge.js',(ROOT/'zotero/bridge.js').read_text(encoding='utf-8').replace('zotero-easyread@local.research','easyread-native-test@local.research'))
print(profile)
