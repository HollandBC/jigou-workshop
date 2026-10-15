"""Package the offline app, self-contained handbook and importable examples."""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
DESTINATION = ROOT.parent / f'机构工坊_v{VERSION}_离线版与使用说明书.zip'
PREFIX = f'机构工坊_v{VERSION}'
files = [ROOT / '机构工坊_离线版.html',
         ROOT / f'docs/机构工坊_使用说明书_{VERSION}.html',
         ROOT / f'output/pdf/机构工坊_使用说明书与案例教程_{VERSION}.pdf',
         ROOT / 'output/教学四杆_毫米几何_2.2.dxf']
files += sorted(p for p in (ROOT / 'examples').rglob('*') if p.is_file())
readme = f'''机构工坊 {VERSION}

用 Edge 或 Chrome 打开“机构工坊_离线版.html”，无需安装或联网。
顶部“使用帮助”可打开配套 HTML 手册与 PDF 教程，请保留目录结构。
examples 中的机构 JSON 从主画布导入；轨迹目标文件从“轨迹合成”窗口导入。
2.3：先画轨迹，再添加两个固定铰点，锁定安装位置求解四杆或齿轮联动五杆。

源码、更新及问题反馈：https://github.com/HollandBC/jigou-workshop
'''
with zipfile.ZipFile(DESTINATION, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.writestr(f'{PREFIX}/开始使用.txt', readme)
    for file in files:
        archive.write(file, f'{PREFIX}/{file.relative_to(ROOT).as_posix()}')
with zipfile.ZipFile(DESTINATION) as archive:
    assert archive.testzip() is None
    for file in files:
        assert archive.read(f'{PREFIX}/{file.relative_to(ROOT).as_posix()}') == file.read_bytes()
print(f'{DESTINATION}\n{len(files) + 1} files, {DESTINATION.stat().st_size / 1024 / 1024:.2f} MiB, CRC and contents verified.')
