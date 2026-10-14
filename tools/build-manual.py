"""Build the standalone Chinese HTML handbook and its vector/text PDF companion."""
import base64
import html
import json
import re
import sys
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
    Spacer, PageBreak, Image, Table, TableStyle, KeepTogether)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.graphics.shapes import Drawing, Line, Circle, Polygon, String
from reportlab.graphics import renderSVG

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
SOURCE = DOCS / f'机构工坊_使用说明书_{VERSION}.md'
PDF = ROOT / 'output' / 'pdf' / f'机构工坊_使用说明书与案例教程_{VERSION}.pdf'
WEB = DOCS / f'机构工坊_使用说明书_{VERSION}.html'
ASSETS = DOCS / 'manual-assets'
ASSETS.mkdir(exist_ok=True)
PDF.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('YaHei', 'C:/Windows/Fonts/msyh.ttc'))
pdfmetrics.registerFont(TTFont('YaHeiBold', 'C:/Windows/Fonts/msyhbd.ttc'))
pdfmetrics.registerFontFamily('YaHei', normal='YaHei', bold='YaHeiBold', italic='YaHei', boldItalic='YaHeiBold')

def diagram():
    model = json.loads((ROOT / 'examples' / '使用说明_从零搭建四杆.机构.json').read_text(encoding='utf-8'))
    points = {n['id']: n for n in model['nodes']}
    d = Drawing(490, 258)
    # Use one scale in both axes; allow room above the highest pin.
    def xy(n): return (60 + (n['x'] + 80) * 1.95, 40 + n['y'] * 1.95)
    d.height = 316
    o, ground = xy(points['O']), xy(points['D'])
    d.add(Line(*o, *ground, strokeColor=colors.HexColor('#acb9ca'), strokeDashArray=[5,4]))
    for l in model['links']:
        a, b = xy(points[l['a']]), xy(points[l['b']]); c = colors.HexColor(l['color'])
        d.add(Line(*a, *b, strokeWidth=3.4, strokeColor=c))
        d.add(String((a[0]+b[0])/2, (a[1]+b[1])/2+12, f"{l['length']:.0f} mm", fontName='YaHei', fontSize=12, fillColor=colors.black, textAnchor='middle'))
    for n in points.values():
        x,y=xy(n)
        if n['fixed']:
            d.add(Polygon([x-11,y-13,x,y,x+11,y-13], fillColor=colors.HexColor('#dce5ef'), strokeColor=colors.HexColor('#657b97')))
        d.add(Circle(x,y,4.6,fillColor=colors.white,strokeColor=colors.HexColor('#405b7a'),strokeWidth=1.7))
        d.add(String(x,y+15 if n['id']=='B' else y-29,n['id'],fontName='YaHeiBold',fontSize=12,fillColor=colors.black,textAnchor='middle'))
    d.add(String((o[0]+ground[0])/2,14,'固定支点间距 160 mm',fontName='YaHei',fontSize=11,fillColor=colors.HexColor('#5e738d'),textAnchor='middle'))
    renderSVG.drawToFile(d, str(ASSETS/'四杆搭建.svg'))
    return d

DRAWING = diagram()

def parse(text):
    lines=text.splitlines(); result=[]; i=0
    boundary=lambda s: not s.strip() or re.match(r'^(#{1,3} |!\[|\||\d+\. )',s)
    while i<len(lines):
        s=lines[i].strip()
        if not s: i+=1;continue
        h=re.match(r'^(#{1,3}) (.+)',s)
        image=re.match(r'^!\[(.*?)\]\((.*?)\)$',s)
        if h: result.append(('h',len(h[1]),h[2]));i+=1
        elif image: result.append(('image',image[1],image[2]));i+=1
        elif s.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',c.replace(' ','')) for c in cells): rows.append(cells)
                i+=1
            result.append(('table',rows))
        elif re.match(r'^\d+\. ',s):
            result.append(('step',s));i+=1
        else:
            paragraph=[s];i+=1
            while i<len(lines) and not boundary(lines[i]):paragraph.append(lines[i].strip());i+=1
            result.append(('p',' '.join(paragraph)))
    return result

BLOCKS=parse(SOURCE.read_text(encoding='utf-8'))
WIDTH=A4[0]-36*mm
STYLES={
 'title':ParagraphStyle('title',fontName='YaHeiBold',fontSize=24,leading=36,textColor=colors.black,spaceAfter=18),
 'intro':ParagraphStyle('intro',fontName='YaHei',fontSize=12,leading=21,textColor=colors.black,spaceAfter=12,wordWrap='CJK'),
 'h2':ParagraphStyle('h2',fontName='YaHeiBold',fontSize=16,leading=24,textColor=colors.black,spaceBefore=19,spaceAfter=9,keepWithNext=True,wordWrap='CJK'),
 'h3':ParagraphStyle('h3',fontName='YaHeiBold',fontSize=12.5,leading=20,textColor=colors.black,spaceBefore=12,spaceAfter=6,keepWithNext=True,wordWrap='CJK'),
 'body':ParagraphStyle('body',fontName='YaHei',fontSize=11,leading=18.5,textColor=colors.black,spaceAfter=9,wordWrap='CJK'),
 'step':ParagraphStyle('step',fontName='YaHei',fontSize=11,leading=18.5,textColor=colors.black,spaceAfter=8,leftIndent=13,firstLineIndent=-13,wordWrap='CJK'),
 'caption':ParagraphStyle('caption',fontName='YaHei',fontSize=9,leading=14,textColor=colors.HexColor('#576b82'),spaceBefore=6,spaceAfter=13,alignment=TA_CENTER,wordWrap='CJK'),
 'cell':ParagraphStyle('cell',fontName='YaHei',fontSize=10,leading=16,wordWrap='CJK'),
 'head':ParagraphStyle('head',fontName='YaHeiBold',fontSize=10,leading=16,textColor=colors.white,wordWrap='CJK'),
}

def txt(s):return html.escape(s).replace('\n','<br/>')

class ManualDoc(BaseDocTemplate):
    def __init__(self,filename):
        super().__init__(str(filename),pagesize=A4,leftMargin=18*mm,rightMargin=18*mm,topMargin=20*mm,bottomMargin=19*mm,title='机构工坊使用说明书与案例教程',author='机构工坊',allowSplitting=True)
        self.addPageTemplates(PageTemplate(id='body',frames=[Frame(self.leftMargin,self.bottomMargin,self.width,self.height,id='normal',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=self.decorate))
    def decorate(self,c,doc):
        c.saveState()
        if doc.page>1:
            c.setFillColor(colors.HexColor('#63758c'));c.setFont('YaHei',8.5);c.drawString(18*mm,A4[1]-12*mm,'机构工坊使用说明书与案例教程')
            c.drawRightString(A4[0]-18*mm,A4[1]-12*mm,VERSION)
        c.setFont('YaHei',9);c.setFillColor(colors.HexColor('#63758c'));c.drawCentredString(A4[0]/2,10*mm,str(doc.page));c.restoreState()
    def afterFlowable(self,flow):
        if isinstance(flow,Paragraph) and hasattr(flow,'chapter_key'):
            key=flow.chapter_key;title=flow.getPlainText();self.canv.bookmarkPage(key);self.canv.addOutlineEntry(title,key,0,False);self.notify('TOCEntry',(0,title,self.page,key))

def picture(label,target):
    p=(DOCS/target).resolve();p.relative_to(ROOT)
    if target.endswith('.svg'):return KeepTogether([DRAWING,Paragraph('图  四杆搭建示意，图中尺寸与教程案例一致。',STYLES['caption'])])
    im=Image(str(p));original_width,original_height=im.imageWidth,im.imageHeight;im.drawWidth=WIDTH;im.drawHeight=WIDTH*original_height/original_width
    # The UI image is an orientation aid; all operating values are stated in body text.
    if im.drawHeight>107*mm:im.drawHeight=107*mm;im.drawWidth=im.drawHeight*im.imageWidth/im.imageHeight
    im.hAlign='CENTER'
    return KeepTogether([Spacer(1,4),im,Paragraph('图  '+txt(label)+'。界面用于定位，操作名称与参数见正文。',STYLES['caption'])])

story=[Spacer(1,22*mm),Paragraph(txt(BLOCKS[0][2]),STYLES['title']),Paragraph('从绘制与搭建到凸轮设计和轨迹逆向求解',STYLES['intro']),Paragraph(f'软件版本 {VERSION}<br/>四类轨迹候选 · {len(list((ROOT / "examples").glob("*.json")))} 份机构案例 · 6 份目标轨迹',STYLES['intro']),Spacer(1,10*mm)]
cover=Image(str(DOCS/f'界面预览_使用说明_主界面_{VERSION}.png'));original_width,original_height=cover.imageWidth,cover.imageHeight;cover.drawWidth=WIDTH;cover.drawHeight=WIDTH*original_height/original_width;story.append(cover)
story+=[Spacer(1,9*mm),Paragraph('建议阅读顺序：先完成四杆和曲柄滑块，再练凸轮，最后学习轨迹合成。',STYLES['intro']),PageBreak(),Paragraph('目录',STYLES['h2'])]
toc=TableOfContents();toc.levelStyles=[ParagraphStyle('toc',fontName='YaHei',fontSize=11,leading=25,leftIndent=0,firstLineIndent=0,spaceBefore=2,wordWrap='CJK')];story+=[toc,Spacer(1,12*mm),Paragraph('PDF 可打印；同目录网页版可按章节浏览和搜索。案例文件位于发布包的 examples 文件夹。',STYLES['body']),PageBreak()]

chapter_index=0
for block in BLOCKS[1:]:
    kind=block[0]
    if kind=='h':
        level,title=block[1:];p=Paragraph(txt(title),STYLES['h2' if level==2 else 'h3'])
        if level==2:chapter_index+=1;p.chapter_key=f'chapter-{chapter_index}'
        story.append(p)
    elif kind in ['p','step']:story.append(Paragraph(txt(block[1]),STYLES['body' if kind=='p' else 'step']))
    elif kind=='image':story.append(picture(block[1],block[2]))
    elif kind=='table':
        rows=block[1];n=len(rows[0]);widths=[WIDTH*.37,WIDTH*.63] if n==2 else [WIDTH*.26,WIDTH*.24,WIDTH*.5] if n==3 else [WIDTH*.19,WIDTH*.25,WIDTH*.25,WIDTH*.31]
        cells=[[Paragraph(txt(c),STYLES['head' if i==0 else 'cell']) for c in row] for i,row in enumerate(rows)]
        t=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#385776')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f4f7fa')]),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#d9d9d9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
        story+=[Spacer(1,5),t,Spacer(1,12)]

ManualDoc(PDF).multiBuild(story)

toc_html=[];parts=[];chapter_index=0
for block in BLOCKS:
    kind=block[0]
    if kind=='h':
        level,title=block[1:];anchor=''
        if level==2:chapter_index+=1;anchor=f' id="chapter-{chapter_index}"';toc_html.append(f'<a href="#chapter-{chapter_index}">{html.escape(title)}</a>')
        parts.append(f'<h{level}{anchor}>{html.escape(title)}</h{level}>')
    elif kind in ['p','step']:parts.append(f'<p class="{kind}">{html.escape(block[1])}</p>')
    elif kind=='image':
        p=DOCS/block[2];mime='image/svg+xml' if p.suffix=='.svg' else 'image/png';data=base64.b64encode(p.read_bytes()).decode();parts.append(f'<figure><img src="data:{mime};base64,{data}" alt="{html.escape(block[1])}"><figcaption>{html.escape(block[1])}</figcaption></figure>')
    elif kind=='table':
        rows=block[1];parts.append('<div class="table-wrap"><table><thead><tr>'+''.join('<th>'+html.escape(c)+'</th>' for c in rows[0])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(c)+'</td>' for c in row)+'</tr>' for row in rows[1:])+'</tbody></table></div>')
template='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>机构工坊使用说明书与案例教程 2.1</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:16px/1.9 "Microsoft YaHei","Segoe UI",sans-serif;background:#f4f7fa;color:#172b43}.layout{display:grid;grid-template-columns:255px minmax(0,900px);max-width:1250px;margin:auto;gap:25px;padding:32px 24px}nav{position:sticky;top:24px;align-self:start;max-height:calc(100vh - 48px);overflow:auto;padding-right:15px}nav strong{font-size:18px;display:block;margin-bottom:16px}nav a{display:block;padding:7px 0;font-size:13px;color:#45688f;text-decoration:none}nav a:hover{color:#215dc7}input{width:100%;font:inherit;font-size:13px;padding:10px;border:1px solid #cfdaea;border-radius:6px;margin:10px 0}main{background:white;border:1px solid #e2e9f2;padding:40px 48px;border-radius:10px;min-width:0}h1,h2,h3{color:black;line-height:1.5}h1{font-size:30px;margin-top:0}h2{font-size:23px;margin-top:40px;scroll-margin-top:20px}h3{font-size:18px;margin-top:26px}p{margin:12px 0}.step{padding-left:20px;text-indent:-20px}.table-wrap{overflow:auto;margin:20px 0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d9d9d9;padding:11px 13px;text-align:left}th{background:#e8eff8;color:black}tbody tr:nth-child(even){background:#f7f9fc}figure{margin:24px 0}figure img{max-width:100%;height:auto;display:block;margin:auto}figcaption{font-size:13px;color:#647991;text-align:center;margin-top:8px}#search-result{font-size:12px;color:#617a99}.actions{font-size:12px;margin:12px 0 20px}button{font:inherit;padding:7px 12px;background:white;border:1px solid #ccd8e8;border-radius:5px;cursor:pointer}mark{background:#ffe8a9;padding:0 2px}footer{margin-top:40px;font-size:13px;color:#617a99}@media(max-width:800px){.layout{display:block;padding:15px}nav{position:static;max-height:none;margin-bottom:20px}nav a{display:inline-block;margin-right:12px}main{padding:24px 20px}h1{font-size:25px}}@media print{body{background:white}.layout{display:block;padding:0}nav,.actions{display:none}main{border:0;padding:0}h2,h3{break-after:avoid}figure,table{break-inside:avoid}a{color:inherit}}
</style></head><body><div class="layout"><nav><strong>机构工坊 2.1</strong><label for="search">查找操作</label><input id="search" type="search" placeholder="例如：手绘凸轮、固定支点"><div id="search-result"></div>__TOC__</nav><main><div class="actions"><button onclick="window.print()">打印本页</button></div>__BODY__<footer>本页面的图像与样式均已内嵌，可单独保存离线阅读。</footer></main></div><script>
const input=document.querySelector('#search'),result=document.querySelector('#search-result');let timer;
input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{for(const mark of document.querySelectorAll('main mark'))mark.replaceWith(document.createTextNode(mark.textContent));document.querySelector('main').normalize();const q=input.value.trim();if(!q){result.textContent='';return;}let count=0,first=null;const walker=document.createTreeWalker(document.querySelector('main'),NodeFilter.SHOW_TEXT),texts=[];while(walker.nextNode())if(walker.currentNode.parentElement.tagName!=='SCRIPT')texts.push(walker.currentNode);for(const node of texts){let s=node.textContent,index=s.indexOf(q);if(index<0)continue;const fragment=document.createDocumentFragment();while(index>=0){fragment.append(document.createTextNode(s.slice(0,index)));const mark=document.createElement('mark');mark.textContent=q;fragment.append(mark);first ||= mark;count++;s=s.slice(index+q.length);index=s.indexOf(q);}fragment.append(document.createTextNode(s));node.replaceWith(fragment);}result.textContent=count?`找到 ${count} 处，可滚动查看高亮`:'没有匹配内容';first?.scrollIntoView({block:'center'});},250);});
</script></body></html>'''
WEB.write_text(template.replace('__TOC__',''.join(toc_html)).replace('__BODY__','\n'.join(parts)),encoding='utf-8')
web = WEB.read_text(encoding='utf-8')
web = web.replace('<title>机构工坊使用说明书与案例教程 2.1</title>', f'<title>机构工坊使用说明书与案例教程 {VERSION}</title>')
web = web.replace('<strong>机构工坊 2.1</strong>', f'<strong>机构工坊 {VERSION}</strong>')
WEB.write_text(web, encoding='utf-8')
print(f'PDF: {PDF}\nHTML: {WEB}')
