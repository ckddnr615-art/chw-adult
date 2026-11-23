/* Each staff tab is a view of the same logical performance key. */
function writeProjectedPerformance_(entry,props){
 if(!Array.isArray(entry.reportStaff))return writePerformanceToTab_(entry,props);
 var targets=entry.reportStaff.filter(function(staff,index,rows){return rows.findIndex(function(row){return row.id===staff.id})===index});
 if(!targets.length||entry.checked&&targets.filter(function(target){return target.checked!==false}).length>1)throw Error('프로그램의 실적 담당자 한 명을 지정해 주세요. 참여자별 배정 방식은 참여자 배정 화면에서 설정하세요.');
 // Each copy has its own retry journal, while N retains the common performance key.
 targets.forEach(function(staff){
  var copy=Object.assign({},entry,{id:'staff-'+sharedHash_(JSON.stringify([entry.id,staff.id])),destinationStaff:staff,staff:staff.name,checked:entry.checked&&staff.checked!==false});
  writePerformanceToTab_(copy,props);
 });
 return {ok:true,id:entry.id,version:entry.version,staffTabs:targets.length};
}
/* Daily-area sheet projection used directly by SharedServer.gs. */
function writePerformanceToTab_(entry,props) {
  var book=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')),sheet,tab,registered;
  if(entry.destinationStaff){
    var registry=JSON.parse(props.getProperty('REPORT_STAFF_TAB_REGISTRY')||'{}');
    registered=registry[entry.destinationStaff.id];
    tab=entry.destinationStaff.name+' 실적';
    if(!entry.destinationStaff.id||!entry.destinationStaff.name||tab.length>100||/[\[\]:*?\/\\]/.test(tab)||tab.indexOf('__CH_')===0)throw Error('실적 담당 직원 이름을 확인해 주세요.');
    sheet=registered?book.getSheets().find(function(s){return s.getSheetId()===registered.sheetId}):null;
    if(registered&&!sheet)throw Error('직원 실적 탭이 삭제되었습니다. 기존 탭을 복구해 주세요.');
    if(!registered){
      // New staff tabs never adopt an unrelated existing tab.
      if(book.getSheets().some(function(s){return s.getName().toLowerCase()===tab.toLowerCase()}))throw Error(tab+' 이름의 탭이 이미 있습니다. 새 직원 탭과 구분하도록 기존 탭 이름을 변경해 주세요.');
      sheet=book.insertSheet(tab);
      registered={sheetId:sheet.getSheetId(),names:[tab]};registry[entry.destinationStaff.id]=registered;
      props.setProperty('REPORT_STAFF_TAB_REGISTRY',JSON.stringify(registry));
    }
  }else{
    var map=JSON.parse(props.getProperty('SHEET_TAB_MAP')||'{}'),registry=JSON.parse(props.getProperty('REPORT_TAB_REGISTRY')||'{}');
    registered=registry[entry.communityId];tab=map[entry.communityId];
    if(!tab)throw Error('출석 당시 소속의 시트 매핑이 없습니다.');
    sheet=registered?book.getSheets().find(function(s){return s.getSheetId()===registered.sheetId}):book.getSheetByName(tab);
    if(registered&&!sheet)throw Error('연결된 실적 탭이 삭제되었습니다. 기존 탭을 복구해 주세요.');
    if(!sheet&&entry.memberId)sheet=book.insertSheet(tab);
    if(!sheet)throw Error('대상 시트가 없습니다. 매핑을 확인하세요.');
  }
  tab=sheet.getName();var aliases=[tab].concat(registered?registered.names:[]);
  var labelHeader=entry.reportMode==='program'?'프로그램명':'영역명';
  var expected=entry.memberId?['이름','','','','','','사업날짜',labelHeader,'','','','담당자','','출석고유키(자동)']:['이름','','','','','','사업날짜',labelHeader,'담당자'];
  if(sheet.getLastRow()===0)sheet.getRange(1,1,1,expected.length).setValues([expected]);
  var headers=sheet.getRange(1,1,1,14).getDisplayValues()[0],staffColumn=headers[11]==='담당자'?12:9,width=staffColumn===12?14:9;
  if(staffColumn===12&&headers[13]!=='출석고유키(자동)')throw Error('자동 고유키 N열을 확인하세요.');
  if(headers[0]!=='이름'||headers[6]!=='사업날짜'||!['영역명','프로그램명','프로그램명 (기존 영역명 포함)'].includes(headers[7])||headers[staffColumn-1]!=='담당자')throw Error('대상 탭의 이름·날짜·실적·담당자 열을 확인해 주세요.');
  if(entry.reportMode==='program'&&headers[7]==='영역명')sheet.getRange(1,8).setValue(sheet.getLastRow()>1?'프로그램명 (기존 영역명 포함)':'프로그램명');
  var ledger=book.getSheetByName('__CH_PERFORMANCE_V1');
  if(!ledger){ledger=book.insertSheet('__CH_PERFORMANCE_V1');ledger.appendRow(['id','version','tab','row','checked','lastRowJson','state']);ledger.hideSheet()}
  var rows=ledger.getLastRow()>1?ledger.getRange(2,1,ledger.getLastRow()-1,7).getValues():[];
  var index=rows.findIndex(function(r){return r[0]===entry.id}),old=index>=0?rows[index]:null;
  if(old&&Number(old[1])>entry.version)throw Error('최신 버전이 이미 저장되어 있습니다.');
  if(old&&Number(old[1])===entry.version&&old[6]==='confirmed')return {ok:true,id:entry.id,version:entry.version,unchanged:true};
  if(old&&aliases.indexOf(old[2])<0)throw Error('기록 당시 소속 탭이 변경되었습니다. 매핑을 복구해 주세요.');
  // Reserve the destination BEFORE projecting it. Retrying after a lost response uses this same row.
  var destination=old?Number(old[3]):Math.max(sheet.getLastRow(),rows.filter(function(r){return aliases.indexOf(r[2])>=0}).reduce(function(max,r){return Math.max(max,Number(r[3])||0)},1))+1;
  var ledgerRow=index>=0?index+2:ledger.getLastRow()+1;
  if(destination>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),destination-sheet.getMaxRows());
  var range=sheet.getRange(destination,1,1,width),current=range.getDisplayValues()[0];
  var prior=old&&old[5]?JSON.parse(old[5]):Array(width).fill('');
  var output=Array(width).fill('');if(entry.checked){output[0]=safeText_(entry.name);output[6]=entry.date;output[7]=safeText_(entry.reportMode==='program'?entry.program:entry.area);output[staffColumn-1]=safeText_(entry.staff);if(width===14)output[13]=entry.reportKey||''}

  // B~F are institution-managed manual columns, never part of projection conflict checks.
  var normalize=function(value){return String(value).replace(/^'/,'')};
  var autoColumns=width===14?[0,6,7,11,13]:[0,6,7,8];if(!autoColumns.every(function(i){return normalize(current[i])===normalize(prior[i])||normalize(current[i])===normalize(output[i])}))throw Error('시트 행이 수동 이동·변경되었습니다. 다른 행을 덮어쓰지 않고 중단합니다.');
  if(!old){ledger.getRange(ledgerRow,1,1,7).setValues([[entry.id,0,tab,destination,false,'','reserved']]);SpreadsheetApp.flush()}
  if(entry.checked){
    sheet.getRange(destination,1).setNumberFormat('@').setValue(output[0]);
    sheet.getRange(destination,7,1,2).setNumberFormat('@').setValues([output.slice(6,8)]);sheet.getRange(destination,staffColumn).setNumberFormat('@').setValue(output[staffColumn-1]);if(width===14)sheet.getRange(destination,14).setNumberFormat('@').setValue(output[13]);
  }else{
    sheet.getRange(destination,1).clearContent();
    sheet.getRange(destination,7,1,2).clearContent();sheet.getRange(destination,staffColumn).clearContent();if(width===14)sheet.getRange(destination,14).clearContent();
  }
  SpreadsheetApp.flush();
  ledger.getRange(ledgerRow,1,1,7).setValues([[entry.id,entry.version,tab,destination,entry.checked,JSON.stringify(output),'confirmed']]);
  SpreadsheetApp.flush();
  return {ok:true,id:entry.id,version:entry.version};
}
function safeText_(value){return /^[ \t\r\n]*[=+\-@']/.test(value)?"'"+value:value}
