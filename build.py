"""Build distributable integration code, without bundling EasyRead or user data."""
from pathlib import Path
import hashlib, json, zipfile

root=Path(__file__).resolve().parent
dist=root/'dist';dist.mkdir(exist_ok=True)
version=json.loads((root/'zotero/manifest.json').read_text(encoding='utf-8'))['version']
xpi=dist/f'zotero-easyread-{version}.xpi'
with zipfile.ZipFile(xpi,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted((root/'zotero').rglob('*')):
        if p.is_file():z.write(p,p.relative_to(root/'zotero').as_posix())
    z.write(root/'LICENSE','LICENSE')
bundle=dist/f'zotero-easyread-{version}.zip'
with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as z:
    z.write(xpi,xpi.name)
    for name in ['README.md','README.en.md','VALIDATION.md','LICENSE','THIRD_PARTY_NOTICES.md','install.ps1','restore.ps1','build.py']:
        z.write(root/name,name)
    for folder in ['zotero','desktop','tests','LICENSES']:
        for p in sorted((root/folder).rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts:z.write(p,p.relative_to(root).as_posix())
for p in [xpi,bundle]:print(p.name,hashlib.sha256(p.read_bytes()).hexdigest())
