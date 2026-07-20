"use strict";
const fs=require("fs"),path=require("path");
const Engine=require("./execution-diagnostics.js");
const data=JSON.parse(fs.readFileSync(path.join(__dirname,"diagnostic-patterns.json"),"utf8"));
const engine=new Engine(data);
const cases=[
["nginx port conflict","nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)","sudo systemctl restart nginx",{SERVICE:"nginx",PORT:"80"},"address-in-use"],
["systemd failure","Job for nginx.service failed because the control process exited with error code.","sudo systemctl restart nginx",{SERVICE:"nginx"},"service-failed"],
["permission denied","cat: /srv/app/config.yml: Permission denied","cat /srv/app/config.yml",{PATH:"/srv/app/config.yml"},"permission-denied"],
["disk full","write error: No space left on device","cp file /var/lib/app/",{PATH:"/var"},"no-space"],
["dns failure","curl: (6) Could not resolve host: example.internal","curl https://example.internal",{HOST:"example.internal"},"dns-resolution"],
["ssh key","admin@host: Permission denied (publickey,gssapi-keyex).","ssh admin@host",{USER:"admin",HOST:"host",PORT:"22"},"ssh-publickey"],
["selinux","type=AVC msg=audit(123): avc: denied { read } for pid=200 comm=\"nginx\"","ausearch -m AVC",{SERVICE:"nginx"},"selinux-avc"],
["dnf match","No match for argument: ngnix\nError: Unable to find a match: ngnix","sudo dnf install ngnix",{PACKAGE:"ngnix"},"dnf-no-match"],
["repo metadata","Failed to download metadata for repo 'baseos'","sudo dnf makecache",{},"repo-metadata"],
["gpg","GPG check FAILED\nPublic key is not installed","sudo dnf install package",{PACKAGE:"package"},"gpg-check"],
["mount","mount: /data: wrong fs type, bad superblock on /dev/sdb1","sudo mount /dev/sdb1 /data",{DEVICE:"/dev/sdb1",MOUNT_POINT:"/data"},"mount-filesystem"],
["oom","Out of memory: Killed process 4432 (java)","systemctl status app",{SERVICE:"app"},"oom-killed"]
];
const failures=[];
for(const [name,output,command,variables,expected] of cases){
  const result=engine.analyze({output,command,variables,task:{title_ar:name},step:{title_ar:name}});
  if(result.id!==expected)failures.push(`${name}: expected ${expected}, got ${result.id}/${result.status}`);
}
const successes=[
["HTTP/1.1 200 OK\nServer: nginx","curl -I http://localhost"],
["active","systemctl is-active nginx"],
["nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file test is successful","nginx -t"]
];
for(const [output,command] of successes){
  const result=engine.analyze({output,command,variables:{SERVICE:"nginx"},task:{},step:{}});
  if(result.status!=="success")failures.push(`success case ${command}: got ${result.id}/${result.status}`);
}
const report=[
"EXECUTION DIAGNOSTIC ENGINE TEST REPORT",
"=======================================",
`Rules: ${data.rules.length}`,
`Success patterns: ${data.success_patterns.length}`,
`Test cases: ${cases.length+successes.length}`,
`Passed: ${cases.length+successes.length-failures.length}`,
`Failed: ${failures.length}`,"",
failures.length?failures.map(x=>`- ${x}`).join("\n"):"All diagnostic tests passed."
].join("\n");
fs.writeFileSync(path.join(__dirname,"EXECUTION_DIAGNOSTIC_TEST_REPORT.txt"),report,"utf8");
console.log(report);
if(failures.length)process.exit(1);
