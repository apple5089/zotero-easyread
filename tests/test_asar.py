from pathlib import Path
import importlib.util, json, struct, unittest

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('patch_asar',root/'desktop/patch_asar.py')
patcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(patcher)

def synthetic_archive():
    main=b'let backendUrl, mainWindow;\nfunction init() {\n  app.whenReady().then(createWindow);\n}\n'
    asset=b'fixture asset with \x00 and binary bytes \xff'
    header={'files':{'electron':{'files':{'main.cjs':{'offset':'0','size':len(main)}}},
                     'asset.bin':{'offset':str(len(main)),'size':len(asset)}}}
    raw=json.dumps(header,separators=(',',':')).encode()
    raw+=b'\x00'*((-len(raw))%4)
    encoded=json.dumps(header,separators=(',',':')).encode()
    pickle=struct.pack('<II',len(raw)+4,len(encoded))+raw
    return struct.pack('<II',4,len(pickle))+pickle+main+asset

class AsarTests(unittest.TestCase):
    def test_assets_and_idempotence(self):
        raw=synthetic_archive();module=(root/'desktop/zotero-bridge.cjs').read_bytes()
        patched=patcher.patch(raw,module)
        self.assertEqual(patched,patcher.patch(patched,module))
        h,b=patcher.read_asar(raw);before={n:d for n,_,d in patcher.flatten(h,raw,b)}
        h,b=patcher.read_asar(patched);after={n:d for n,_,d in patcher.flatten(h,patched,b)}
        self.assertEqual(before['asset.bin'],after['asset.bin'])
        self.assertIn(patcher.MARKER.encode(),after['electron/main.cjs'])
        self.assertEqual(module,after['electron/zotero-bridge.cjs'])
    def test_unknown_version_is_rejected(self):
        with self.assertRaises(ValueError):patcher.patched_main('unrecognized version')

if __name__=='__main__':unittest.main()
