import {spawnSync} from 'node:child_process';
for(const cmd of ['node','forge','anvil','cast','solc']) {
 const r=spawnSync(cmd,['--version'],{encoding:'utf8',timeout:5000});
 console.log(`${cmd}: ${r.status===0?(r.stdout||r.stderr).trim().split('\n')[0]:'NOT AVAILABLE'}`);
}
