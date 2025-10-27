#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'main.js');

function main(){
  let source;
  try{
    source = fs.readFileSync(targetPath, 'utf8');
  }catch(err){
    console.error('[update_notice_assignments] main.js の読み込みに失敗しました:', err.message);
    process.exitCode = 1;
    return;
  }

  const pattern = /(\n?)(^[\t ]*)CURRENT_NOTICE\s*=\s*appliedNotice\s*;\s*(?:\r?\n\2updateNoticeArea\(\)\s*;)?/gm;
  let replaced = false;
  const nextSource = source.replace(pattern, (full, leadingNewline, indent) => {
    replaced = true;
    const prefix = leadingNewline || '';
    return `${prefix}${indent}applyCurrentNotice(appliedNotice);`;
  });

  if(!replaced){
    console.log('[update_notice_assignments] 更新対象のパターンは見つかりませんでした。既に適用済みの可能性があります。');
    return;
  }

  try{
    fs.writeFileSync(targetPath, nextSource, 'utf8');
    console.log('[update_notice_assignments] main.js を更新しました。');
  }catch(err){
    console.error('[update_notice_assignments] main.js の書き込みに失敗しました:', err.message);
    process.exitCode = 1;
  }
}

main();
