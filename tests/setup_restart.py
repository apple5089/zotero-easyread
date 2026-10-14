from pathlib import Path
import json, zipfile
root=Path(__file__).resolve().parents[1]; work=root/'test-work'
manifest=json.loads((root/'zotero/manifest.json').read_text(encoding='utf-8'))
manifest['applications']['zotero']['id']='easyread-native-test@local.research'
bootstrap=(root/'zotero/bootstrap.js').read_text(encoding='utf-8')+'\nconst TEST_ROOT='+json.dumps(str(work))+';\n'+(root/'tests/restart_harness.js').read_text(encoding='utf-8')
with zipfile.ZipFile(work/'profile/extensions/easyread-native-test@local.research.xpi','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json',json.dumps(manifest));z.writestr('bootstrap.js',bootstrap)
    for name in ['core.js','prefs.js','prefs.xhtml']:z.write(root/'zotero'/name,name)
    z.writestr('bridge.js',(root/'zotero/bridge.js').read_text(encoding='utf-8').replace('zotero-easyread@local.research','easyread-native-test@local.research'))
print('Restart harness ready')
