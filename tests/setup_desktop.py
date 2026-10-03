"""Create an isolated QA copy of Electron; neither user's settings nor data are used."""
from pathlib import Path
import argparse, importlib.util, json, shutil

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True)
original=parser.parse_args().source; qa=root/'test-work/desktop-app'
qa.mkdir(parents=True,exist_ok=True)
for p in original.iterdir():
    if p.name=='resources' or 'uninstall' in p.name.lower():continue
    target=qa/p.name
    if p.is_file():shutil.copy2(p,target)
    elif p.is_dir():shutil.copytree(p,target,dirs_exist_ok=True)
(qa/'resources/backend').mkdir(parents=True,exist_ok=True)
shutil.copy2(original/'resources/backend/easyread-backend.exe',qa/'resources/backend/easyread-backend.exe')
spec=importlib.util.spec_from_file_location('patch_asar',root/'desktop/patch_asar.py')
patcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(patcher)
# Only the disposable copy uses this alternative Electron window profile.
module=(root/'desktop/zotero-bridge.cjs').read_bytes()
raw=(original/'resources/app.asar').read_bytes()
h,b=patcher.read_asar(raw)
files=patcher.flatten(h,raw,b)
main=next(data for n,_,data in files if n=='electron/main.cjs').decode()
home=root/'test-work/desktop-home'; userdata=root/'test-work/desktop-userdata'
home.mkdir(exist_ok=True); userdata.mkdir(exist_ok=True)
(home/'config.json').write_text(json.dumps({'engine':'none','auto_translate':False,'check_updates':False}),encoding='utf-8')
main=main.replace('app.setPath("userData", path.join(app.getPath("appData"), "EasyRead"));',
    'app.setPath("userData", '+json.dumps(str(userdata))+');')
# The test copy must stay isolated even when launched by Zotero (which does not
# inherit the test runner's environment).
main='process.env.EASYREAD_HOME = '+json.dumps(str(home))+';\n'+main
# Pack the altered QA main first, then apply the identical release patch.
original_function=patcher.patched_main
patcher.patched_main=lambda _main:original_function(main)
(qa/'resources/app.asar').write_bytes(patcher.patch(raw,module))
(root/'test-work/desktop-test.json').write_text(json.dumps({'home':str(home),'exe':str(qa/'EasyRead.exe')}),encoding='utf-8')
print('Isolated desktop ready')
