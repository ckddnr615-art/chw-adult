/* Daily-area sheet projection used directly by SharedServer.gs. */
function writeProjectedPerformance_(entry,props) {
  var map=JSON.parse(props.getProperty('SHEET_TAB_MAP')||'{}'),tab=map[entry.communityId];
  if(!tab)throw Error('출석 당시 소속의 시트 매핑이 없습니다.');
  var book=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')),sheet=book.getSheetByName(tab);
  if(!sheet&&entry.memberId)sheet=book.insertSheet(tab);if(!sheet)throw Error('대상 시트가 없습니다. 매핑을 확인하세요.');
  var expected=entry.memberId?['이름','','','','','','사업날짜','영역명','','','','담당자','','출석고유키(자동)']:['이름','','','','','','사업날짜','영역명','담당자'];
  if(sheet.getLastRow()===0)sheet.getRange(1,1,1,expected.length).setValues([expected]);
  var headers=sheet.getRange(1,1,1,14).getDisplayValues()[0],staffColumn=headers[11]==='담당자'?12:9,width=staffColumn===12?14:9;
  if(staffColumn===12&&headers[13]!=='출석고유키(자동)')throw Error('자동 고유키 N열을 확인하세요.');
  if(headers[0]!=='이름'||headers[6]!=='사업날짜'||headers[7]!=='영역명'||headers[staffColumn-1]!=='담당자')throw Error('대상 탭의 9열 헤더가 계약과 다릅니다.');
  var ledger=book.getSheetByName('__CH_PERFORMANCE_V1');
  if(!ledger){ledger=book.insertSheet('__CH_PERFORMANCE_V1');ledger.appendRow(['id','version','tab','row','checked','lastRowJson','state']);ledger.hideSheet()}
  var rows=ledger.getLastRow()>1?ledger.getRange(2,1,ledger.getLastRow()-1,7).getValues():[];
  var index=rows.findIndex(function(r){return r[0]===entry.id}),old=index>=0?rows[index]:null;
  if(old&&Number(old[1])>entry.version)throw Error('최신 버전이 이미 저장되어 있습니다.');
  if(old&&Number(old[1])===entry.version&&old[6]==='confirmed')return {ok:true,id:entry.id,version:entry.version,unchanged:true};
  if(old&&old[2]!==tab)throw Error('기록 당시 커뮤니티 탭이 변경되었습니다. 매핑을 복구해 주세요.');
  // Reserve the destination BEFORE projecting it. Retrying after a lost response uses this same row.
  var destination=old?Number(old[3]):Math.max(sheet.getLastRow(),rows.filter(function(r){return r[2]===tab}).reduce(function(max,r){return Math.max(max,Number(r[3])||0)},1))+1;
  var ledgerRow=index>=0?index+2:ledger.getLastRow()+1;
  if(destination>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),destination-sheet.getMaxRows());
  var range=sheet.getRange(destination,1,1,width),current=range.getDisplayValues()[0];
  var prior=old&&old[5]?JSON.parse(old[5]):Array(width).fill('');
  var output=Array(width).fill('');if(entry.checked){output[0]=safeText_(entry.name);output[6]=entry.date;output[7]=safeText_(entry.area);output[staffColumn-1]=safeText_(entry.staff);if(width===14)output[13]=entry.reportKey||''}

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
