#!/usr/bin/env node
// node scripts/functional_parity_controls.cjs BASE TARGET [--working-tree] > report.md
const fs=require('fs'), cp=require('child_process'), crypto=require('crypto'), ts=require('typescript');
const [baseArg,targetArg,...flags]=process.argv.slice(2);
if(!baseArg||!targetArg||flags.some(x=>x!=='--working-tree')){console.error('Usage: node scripts/functional_parity_controls.cjs BASE TARGET [--working-tree] > report.md');process.exit(2)}
const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
const base=git(['rev-parse','--verify',`${baseArg}^{commit}`]).trim(),target=git(['rev-parse','--verify',`${targetArg}^{commit}`]).trim(),working=flags.includes('--working-tree');
const qualify=p=>/^src\/[^/]+\.tsx$/.test(p)&&!/\.(test|spec)\.tsx$/.test(p);
const clean=x=>String(x||'').replace(/\s+/g,' ').trim(),safe=x=>clean(x).replace(/\|/g,'\\|').replace(/`/g,"'");
const tags=new Set(['button','input','select','textarea','a','form','summary','details','dialog','option']);
function extract(path,source){
 const sf=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(sf.parseDiagnostics.length)throw Error(`${path}: ${sf.parseDiagnostics.length} TypeScript parse errors`);
 let rows=[];
 function visit(node){
  let opening,element;if(ts.isJsxElement(node)){opening=node.openingElement;element=node}else if(ts.isJsxSelfClosingElement(node)){opening=node;element=node}
  if(opening){
   const tag=opening.tagName.getText(sf),attrs=opening.attributes.properties;
   const events=attrs.filter(a=>ts.isJsxAttribute(a)&&/^on[A-Z]/.test(a.name.getText(sf))).map(a=>`${a.name.getText(sf)}=${a.initializer?a.initializer.getText(sf):'true'}`);
   const spread=attrs.filter(ts.isJsxSpreadAttribute).map(a=>`...${a.expression.getText(sf)}`);
   const semantic=attrs.filter(a=>ts.isJsxAttribute(a)&&['role','tabIndex','aria-label','title','type','name'].includes(a.name.getText(sf))).map(a=>`${a.name.getText(sf)}=${a.initializer?a.initializer.getText(sf):'true'}`);
   if(tags.has(tag)||events.length||/^[A-Z]/.test(tag)||tag.includes('.')||semantic.some(a=>/^(role|tabIndex)=/.test(a))){
    const loc=sf.getLineAndCharacterOfPosition(opening.getStart(sf)),labels=[];
    if(ts.isJsxElement(element))for(const child of element.children){if(ts.isJsxText(child)&&child.getText(sf).trim())labels.push(child.getText(sf).trim());if(ts.isJsxExpression(child)&&child.expression&&ts.isStringLiteral(child.expression))labels.push(child.expression.text)}
    const label=clean(labels.join(' ')),eventsText=clean(events.join('; '));
    const signature=JSON.stringify([tag,label,eventsText,clean(spread.join('; ')),clean(semantic.join('; '))]);
    const identifiers=new Set((eventsText.match(/[a-zA-Z_$][\w$]*/g)||[]).filter(x=>!['onClick','onChange','onSubmit','onKeyDown','onKeyUp','onMouseDown','onMouseEnter','onMouseLeave','onBlur','onFocus','true','false','return'].includes(x)));
    rows.push({path,line:loc.line+1,col:loc.character+1,tag,label,events:eventsText,spread:clean(spread.join('; ')),signature,identifiers});
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(sf);return rows;
}
function snapshot(revision,useWorking){
 const files=useWorking?fs.readdirSync('src').map(f=>`src/${f}`).filter(qualify).sort():git(['ls-tree','-r','--name-only',revision,'--','src']).split('\n').filter(qualify).sort();
 const hashes=[],rows=files.flatMap(p=>{const source=useWorking?fs.readFileSync(p,'utf8'):git(['show',`${revision}:${p}`]);hashes.push([p,crypto.createHash('sha256').update(source).digest('hex')]);return extract(p,source)});
 return{files,rows,hashes,manifest:crypto.createHash('sha256').update(hashes.map(x=>x.join('  ')).join('\n')).digest('hex')};
}
const before=snapshot(base,false),after=snapshot(target,working),matchedBefore=new Set(),matchedAfter=new Set();let localExact=0,movedExact=0;
for(const localOnly of [true,false]){
 const index=new Map();after.rows.forEach((row,i)=>{if(matchedAfter.has(i))return;const key=(localOnly?row.path+'\0':'')+row.signature;if(!index.has(key))index.set(key,[]);index.get(key).push(i)});
 before.rows.forEach((row,i)=>{if(matchedBefore.has(i))return;const key=(localOnly?row.path+'\0':'')+row.signature,cs=index.get(key);while(cs?.length&&matchedAfter.has(cs[0]))cs.shift();if(cs?.length){matchedBefore.add(i);matchedAfter.add(cs.shift());if(localOnly)localExact++;else movedExact++}});
}
const oldUnmatched=before.rows.filter((_,i)=>!matchedBefore.has(i)),newUnmatched=after.rows.filter((_,i)=>!matchedAfter.has(i));
function candidates(row){return newUnmatched.map(n=>{if(n.tag!==row.tag)return null;const shared=[...row.identifiers].filter(x=>n.identifiers.has(x)).length,sameLabel=Boolean(row.label&&row.label===n.label),score=(row.path===n.path?3:0)+(sameLabel?5:0)+Math.min(shared,4)*2;return score>=5?{n,score}:null}).filter(Boolean).sort((a,b)=>b.score-a.score||a.n.path.localeCompare(b.n.path)||a.n.line-b.n.line).slice(0,2)}
const describe=r=>`${r.path}:${r.line}:${r.col} ${r.tag}${r.label?` «${r.label.slice(0,70)}»`:''}${r.events?`; ${r.events.slice(0,140)}`:''}${r.spread?`; ${r.spread.slice(0,80)}`:''}`;
let out=`# VYRON — структурное сопоставление JSX\n\nИсходный Git-срез: ${base}. Целевой ${working?'рабочий каталог относительно HEAD':'Git-срез'}: ${target}. SHA-256 манифеста файлов: исходный ${before.manifest}, целевой ${after.manifest}. Режим рабочего каталога включает незакоммиченные и untracked TSX; его содержимое могло измениться после снятия снимка.\n\nКоманда: node scripts/functional_parity_controls.cjs ${base} ${target}${working?' --working-tree':''} > FUNCTIONAL_CONTROL_DIFF${working?'_WORKTREE':''}.md\n\nСреда: Node.js ${process.version}, TypeScript ${ts.version}. Изучены только файлы src/*.tsx кроме тестов. AST включает интерактивные теги, обработчики, элементы с role/tabIndex и вызовы компонентов. Точное совпадение означает совпадение тега, непосредственного текста, событий, spread и выбранных атрибутов; JSX-дерево, семантика зависимостей и исполнение не сверены. Одни узлы могут представлять множество действий, условных состояний и каналов. Совпадение не означает PASS. Отсутствие совпадения или предполагаемое переименование не означает утрату функционала. Отчёт не содержит данных пользователя.\n\n| Метрика | Количество |\n|---|---:|\n| Файлы исходного / целевого среза | ${before.files.length} / ${after.files.length} |\n| Узлы исходного / целевого среза | ${before.rows.length} / ${after.rows.length} |\n| Точное структурное совпадение в том же файле | ${localExact} |\n| Точное структурное совпадение в другом файле | ${movedExact} |\n| Исходные узлы без точного соответствия | ${oldUnmatched.length} |\n| Новые узлы без точного соответствия | ${newUnmatched.length} |\n\n## Исходные узлы без точного соответствия\n\nКандидаты выбираются только эвристически: тот же тег, тот же файл, идентичный непосредственный текст и/или общие идентификаторы в обработчиках. Возможны ложные совпадения, пропущенные перенесённые функции и несколько кандидатов на один узел. Проверять исходные и новые обработчики вручную. Для исходной строки использовать git show ${base}:ПУТЬ; ссылка на файл рабочего каталога не отражает старый коммит.\n\n| Исходный узел: файл, строка, колонка, обработчик | Возможные кандидаты APEX |\n|---|---|\n`;
for(const row of oldUnmatched){const cs=candidates(row);out+=`| ${safe(describe(row))} | ${cs.length?cs.map(c=>safe(describe(c.n))).join('<br>'):'Кандидат не найден автоматически; проверить вручную'} |\n`}
out+='\n## Целевые узлы без точного соответствия\n\nНовые узлы могут заменять старые или добавлять функции. Ручная проверка обязательна.\n\n| Узел APEX: файл, строка, колонка, обработчик |\n|---|\n';
for(const row of newUnmatched)out+=`| ${safe(describe(row))} |\n`;
out+='\n## Манифесты SHA-256 содержимого\n\nОни идентифицируют прочитанные файлы, но не включают другие ресурсы приложения.\n\n| Файл | Исходный срез | Целевой срез |\n|---|---|---|\n';
const b=new Map(before.hashes),a=new Map(after.hashes);for(const p of [...new Set([...b.keys(),...a.keys()])].sort())out+=`| ${p} | ${b.get(p)||'нет'} | ${a.get(p)||'нет'} |\n`;
process.stdout.write(out);
