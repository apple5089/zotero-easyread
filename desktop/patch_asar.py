"""Produce a reversible desktop integration patch, using only Python stdlib.

Never modifies installed applications. install.ps1 applies the verified output.
"""
from pathlib import Path
import argparse, copy, hashlib, json, struct

ROOT = Path(__file__).resolve().parents[1]
MARKER = '// Zotero EasyRead desktop bridge v0.1.0'

def read_asar(raw):
    if len(raw) < 16 or struct.unpack_from('<I', raw)[0] != 4:
        raise ValueError('Unsupported ASAR header')
    size = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[16:16+size]), 8 + struct.unpack_from('<I', raw, 4)[0]

def flatten(header, raw, base, prefix=''):
    files = []
    for name, entry in header['files'].items():
        relative = prefix + name
        if 'files' in entry:
            files.extend(flatten(entry, raw, base, relative + '/'))
        elif 'offset' in entry:
            start = base + int(entry['offset'])
            data = raw[start:start+entry['size']]
            if len(data) != entry['size']: raise ValueError('Truncated ASAR: ' + relative)
            files.append((relative, entry, data))
        else:
            raise ValueError('Unpacked/symlink ASAR not supported: ' + relative)
    return files

def integrity(data):
    return {'algorithm':'SHA256','hash':hashlib.sha256(data).hexdigest(),'blockSize':4194304,
            'blocks':[hashlib.sha256(data[i:i+4194304]).hexdigest() for i in range(0,len(data),4194304)]}

def patched_main(main):
    if MARKER in main: return main
    anchor = '  app.whenReady().then(createWindow);'
    if main.count(anchor) != 1 or 'backendUrl' not in main or 'mainWindow' not in main:
        raise ValueError('EasyRead desktop layout changed; patch aborted without changing installation')
    replacement = '''  app.whenReady().then(async () => {
    await createWindow();
    require("./zotero-bridge.cjs").start({
      app, fs, path, os, getWindow: () => mainWindow,
      getUrl: () => backendUrl, createWindow
    });
  });'''
    return MARKER + '\n' + main.replace(anchor,replacement)

def patch(raw, module):
    header, base = read_asar(raw)
    header = copy.deepcopy(header)
    files = flatten(header, raw, base)
    main_found = False
    result = []
    for name, entry, data in files:
        if name == 'electron/main.cjs':
            data = patched_main(data.decode('utf-8')).encode('utf-8'); main_found = True
        if name == 'electron/zotero-bridge.cjs': data = module
        result.append((name,entry,data))
    if not main_found: raise ValueError('Missing electron/main.cjs')
    if not any(n == 'electron/zotero-bridge.cjs' for n,_,_ in result):
        entry = {}; header['files']['electron']['files']['zotero-bridge.cjs'] = entry
        result.append(('electron/zotero-bridge.cjs',entry,module))
    content = bytearray()
    for name,entry,data in sorted(result, key=lambda row: row[0]):
        entry['offset'] = str(len(content)); entry['size'] = len(data)
        if 'integrity' in entry or name.endswith('/zotero-bridge.cjs'): entry['integrity'] = integrity(data)
        content.extend(data)
    json_bytes = json.dumps(header,separators=(',',':'),ensure_ascii=False).encode('utf-8')
    padding = b'\x00' * ((-len(json_bytes)) % 4)
    payload_size = 4 + len(json_bytes) + len(padding)
    header_pickle = struct.pack('<II', payload_size,len(json_bytes)) + json_bytes + padding
    output = struct.pack('<II',4,len(header_pickle)) + header_pickle + content
    new_header,new_base = read_asar(output)
    # Every asset must survive exact byte comparison, including unchanged icons.
    actual = {n:d for n,_,d in flatten(new_header,output,new_base)}
    assert all(actual[n] == d for n,_,d in result)
    return output

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source',type=Path,required=True,help='Installed EasyRead resources/app.asar')
    ap.add_argument('--out',type=Path,default=ROOT/'dist'/'app.asar'); args=ap.parse_args()
    original=args.source.read_bytes(); result=patch(original,(ROOT/'desktop'/'zotero-bridge.cjs').read_bytes())
    args.out.parent.mkdir(parents=True,exist_ok=True); args.out.write_bytes(result)
    metadata={'source':args.source.name,'originalSHA256':hashlib.sha256(original).hexdigest(),'patchedSHA256':hashlib.sha256(result).hexdigest(),'bridgeVersion':'0.1.0'}
    (args.out.parent/'desktop-patch.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    print(json.dumps(metadata,indent=2))

if __name__=='__main__': main()
