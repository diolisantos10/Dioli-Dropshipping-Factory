import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';
const source=process.env.DATABASE_URL;const target=process.env.DDF_RESTORE_DATABASE_URL;
if(!source||!target)throw new Error('Defina DATABASE_URL e DDF_RESTORE_DATABASE_URL (banco isolado).');
if(source===target)throw new Error('O banco de restauração deve ser diferente da origem.');
const dir=mkdtempSync(join(tmpdir(),'ddf-restore-'));const dump=join(dir,'ddf.dump');
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit'});if(result.status!==0)throw new Error(`${command} falhou (${result.status??'sem status'}).`)}
try{run('pg_dump',['--format=custom','--no-owner','--file',dump,source]);run('pg_restore',['--clean','--if-exists','--no-owner','--dbname',target,dump]);run('psql',[target,'--set','ON_ERROR_STOP=1','--command','SELECT version FROM schema_migrations ORDER BY version;']);console.log('Restore drill concluído no banco isolado.')}finally{rmSync(dir,{recursive:true,force:true})}
