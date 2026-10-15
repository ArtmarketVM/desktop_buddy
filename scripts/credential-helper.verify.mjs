import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const root=new URL('../src-tauri/native/credential-helper/',import.meta.url);
export function verifyHelper(path=new URL('BuddyCredentialAccess',root)) {
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
 const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 assert.equal(hash(new URL('main.m',root)),manifest.sourceSha256,'Helper source changed: review and explicitly rebuild its independent version');
 assert.equal(hash(path),manifest.binarySha256,'The immutable credential helper was modified or re-signed');
 if(process.platform==='darwin') {
  execFileSync('/usr/bin/codesign',['--verify','--strict','-R','=identifier "com.artmarketvm.desktopbuddy.credentials" and certificate root = H"9b85d29dad2e9328ec27631337e3e9313383ab20"',path instanceof URL?path.pathname:path],{stdio:'pipe'});
 }
 return manifest.binarySha256;
}
test('credential helper retains its independently pinned source and binary',()=>{verifyHelper();});
test('Mac packaging includes the immutable helper and normal builds never regenerate it',()=>{
 const config=JSON.parse(readFileSync(new URL('../src-tauri/tauri.macos.conf.json',import.meta.url)));
 assert.equal(config.bundle.macOS.files['Helpers/BuddyCredentialAccess'],'native/credential-helper/BuddyCredentialAccess');
 const build=readFileSync(new URL('./build-macos.sh',import.meta.url),'utf8');
 assert(!build.includes('create-credential-helper.sh'));
});
