#!/usr/bin/env python3
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parent
COMMANDS_FILE = ROOT / "commands.json"
WORKFLOWS_FILE = ROOT / "workflows.seed.json"
ENTITIES_FILE = ROOT / "entities.seed.json"
OUTPUT_FILE = ROOT / "knowledge.json"

COMMAND_PAGE_MAP = {
    "at": "cmd-at",
    "atq": "cmd-atq",
    "atrm": "cmd-atrm",
    "audit2why": "cmd-audit2why",
    "ausearch": "cmd-ausearch",
    "automount": "cmd-automount",
    "awk": "cmd-awk",
    "basename": "cmd-basename",
    "bash": "cmd-bash",
    "bg": "cmd-bg",
    "blkid": "cmd-blkid",
    "bunzip2": "cmd-bunzip2",
    "bzip2": "cmd-bzip2",
    "cat": "cmd-cat",
    "cd": "cmd-cd",
    "chage": "cmd-chage",
    "chcon": "cmd-chcon",
    "chgrp": "cmd-chgrp",
    "chmod": "cmd-chmod",
    "chown": "cmd-chown",
    "chronyc": "cmd-chronyc",
    "chroot": "cmd-chroot",
    "command": "cmd-command",
    "cp": "cmd-cp",
    "crontab": "cmd-crontab",
    "curl": "cmd-curl",
    "cut": "cmd-cut",
    "date": "cmd-date",
    "df": "cmd-df",
    "diff": "cmd-diff",
    "dig": "cmd-dig",
    "dirname": "cmd-dirname",
    "dmesg": "cmd-dmesg",
    "dnf": "cmd-dnf",
    "du": "cmd-du",
    "e2fsck": "cmd-e2fsck",
    "echo": "cmd-echo",
    "env": "cmd-env",
    "fdisk": "cmd-fdisk",
    "fg": "cmd-fg",
    "file": "cmd-file",
    "find": "cmd-find",
    "findmnt": "cmd-findmnt",
    "firewall-cmd": "cmd-firewall-cmd",
    "flatpak": "cmd-flatpak",
    "free": "cmd-free",
    "fuser": "cmd-fuser",
    "getenforce": "cmd-getenforce",
    "getent": "cmd-getent",
    "getfacl": "cmd-getfacl",
    "getsebool": "cmd-getsebool",
    "gpasswd": "cmd-gpasswd",
    "grep": "cmd-grep",
    "groupadd": "cmd-groupadd",
    "groupdel": "cmd-groupdel",
    "groupmod": "cmd-groupmod",
    "groups": "cmd-groups",
    "grub2-editenv": "cmd-grub2-editenv",
    "grub2-mkconfig": "cmd-grub2-mkconfig",
    "grubby": "cmd-grubby",
    "gunzip": "cmd-gunzip",
    "gzip": "cmd-gzip",
    "head": "cmd-head",
    "history": "cmd-history",
    "host": "cmd-host",
    "hostnamectl": "cmd-hostnamectl",
    "id": "cmd-id",
    "info": "cmd-info",
    "iostat": "cmd-iostat",
    "ip": "cmd-ip",
    "jobs": "cmd-jobs",
    "journalctl": "cmd-journalctl",
    "kill": "cmd-kill",
    "killall": "cmd-killall",
    "last": "cmd-last",
    "lastlog": "cmd-lastlog",
    "less": "cmd-less",
    "ln": "cmd-ln",
    "locate": "cmd-locate",
    "logger": "cmd-logger",
    "ls": "cmd-ls",
    "lsblk": "cmd-lsblk",
    "lscpu": "cmd-lscpu",
    "lsof": "cmd-lsof",
    "lvcreate": "cmd-lvcreate",
    "lvextend": "cmd-lvextend",
    "lvreduce": "cmd-lvreduce",
    "lvremove": "cmd-lvremove",
    "lvs": "cmd-lvs",
    "man": "cmd-man",
    "matchpathcon": "cmd-matchpathcon",
    "mkdir": "cmd-mkdir",
    "mkfs.ext4": "cmd-mkfs-ext4",
    "mkfs.vfat": "cmd-mkfs-vfat",
    "mkfs.xfs": "cmd-mkfs-xfs",
    "mkswap": "cmd-mkswap",
    "mktemp": "cmd-mktemp",
    "mount": "cmd-mount",
    "mv": "cmd-mv",
    "namei": "cmd-namei",
    "nc": "cmd-nc",
    "newgrp": "cmd-newgrp",
    "nice": "cmd-nice",
    "nmcli": "cmd-nmcli",
    "nmtui": "cmd-nmtui",
    "nohup": "cmd-nohup",
    "parted": "cmd-parted",
    "passwd": "cmd-passwd",
    "pgrep": "cmd-pgrep",
    "ping": "cmd-ping",
    "pkill": "cmd-pkill",
    "printf": "cmd-printf",
    "ps": "cmd-ps",
    "pvcreate": "cmd-pvcreate",
    "pvremove": "cmd-pvremove",
    "pvs": "cmd-pvs",
    "pwd": "cmd-pwd",
    "read": "cmd-read",
    "reboot": "cmd-reboot",
    "renice": "cmd-renice",
    "resize2fs": "cmd-resize2fs",
    "restorecon": "cmd-restorecon",
    "rm": "cmd-rm",
    "rmdir": "cmd-rmdir",
    "rpm": "cmd-rpm",
    "rsync": "cmd-rsync",
    "scp": "cmd-scp",
    "sed": "cmd-sed",
    "semanage": "cmd-semanage",
    "seq": "cmd-seq",
    "sestatus": "cmd-sestatus",
    "setenforce": "cmd-setenforce",
    "setfacl": "cmd-setfacl",
    "setsebool": "cmd-setsebool",
    "sftp": "cmd-sftp",
    "showmount": "cmd-showmount",
    "shutdown": "cmd-shutdown",
    "sort": "cmd-sort",
    "sos": "cmd-sos",
    "source": "cmd-source",
    "ss": "cmd-ss",
    "ssh": "cmd-ssh",
    "ssh-copy-id": "cmd-ssh-copy-id",
    "ssh-keygen": "cmd-ssh-keygen",
    "stat": "cmd-stat",
    "su": "cmd-su",
    "subscription-manager": "cmd-subscription-manager",
    "sudo": "cmd-sudo",
    "swapoff": "cmd-swapoff",
    "swapon": "cmd-swapon",
    "systemctl": "cmd-systemctl",
    "systemd-analyze": "cmd-systemd-analyze",
    "tail": "cmd-tail",
    "tar": "cmd-tar",
    "tee": "cmd-tee",
    "test": "cmd-test",
    "timedatectl": "cmd-timedatectl",
    "top": "cmd-top",
    "touch": "cmd-touch",
    "traceroute": "cmd-traceroute",
    "tree": "cmd-tree",
    "tune2fs": "cmd-tune2fs",
    "tuned-adm": "cmd-tuned-adm",
    "umask": "cmd-umask",
    "umount": "cmd-umount",
    "uname": "cmd-uname",
    "uniq": "cmd-uniq",
    "unzip": "cmd-unzip",
    "uptime": "cmd-uptime",
    "useradd": "cmd-useradd",
    "userdel": "cmd-userdel",
    "usermod": "cmd-usermod",
    "vgcreate": "cmd-vgcreate",
    "vgextend": "cmd-vgextend",
    "vgreduce": "cmd-vgreduce",
    "vgremove": "cmd-vgremove",
    "vgs": "cmd-vgs",
    "vim": "cmd-vim",
    "visudo": "cmd-visudo",
    "vmstat": "cmd-vmstat",
    "w": "cmd-w",
    "wc": "cmd-wc",
    "whoami": "cmd-whoami",
    "xargs": "cmd-xargs",
    "xfs_admin": "cmd-xfs-admin",
    "xfs_growfs": "cmd-xfs-growfs",
    "xfs_info": "cmd-xfs-info",
    "xfs_repair": "cmd-xfs-repair",
    "zip": "cmd-zip",
    "yum": "cmd-dnf",
    "vi": "cmd-vim",
    "[": "cmd-test",
    "sh": "cmd-bash"
}

def first_command_name(command):
    text = str(command or "").strip()
    text = re.sub(r"^sudo\s+", "", text)
    text = re.sub(r"^[A-Z_]+=[^\s]+\s+", "", text)
    first = re.split(r"\s+|\||;", text, maxsplit=1)[0]
    return first.rsplit("/", 1)[-1]

def unique(values):
    return list(dict.fromkeys(item for item in values if item))

def convert_legacy(command):
    command_name = first_command_name(command.get("command"))
    related = [COMMAND_PAGE_MAP[command_name]] if command_name in COMMAND_PAGE_MAP else []
    return {
        "id": f"legacy-{command['id']}",
        "entity_type": "task",
        "content_level": "legacy",
        "title_ar": command["title_ar"],
        "goal_ar": command["title_ar"],
        "summary_ar": command["description_ar"],
        "category": command.get("category", "legacy"),
        "difficulty": "beginner",
        "estimated_minutes": 3,
        "keywords_ar": unique(command.get("keywords_ar", []) + [command["title_ar"], command["command"]]),
        "supported_versions": command.get("rhel_versions", ["8", "9", "10"]),
        "risk": command.get("risk", "low"),
        "prerequisites_ar": ["صلاحية sudo"] if command.get("requires_sudo") else [],
        "variables": [],
        "steps": [{
            "id": "run-command",
            "title_ar": command["title_ar"],
            "command": command["command"],
            "explanation_ar": command["description_ar"],
            "requires_sudo": bool(command.get("requires_sudo")),
            "risk": command.get("risk", "low"),
            "optional": False,
            "expected_result_ar": "",
            "notes_ar": command.get("notes_ar", "")
        }],
        "verification": [], "rollback_ar": [], "common_errors": [],
        "files": [], "ports": [],
        "related_entities": related,
        "tags_ar": ["أمر سريع"],
        "safety_notes_ar": [command["notes_ar"]] if command.get("notes_ar") else [],
        "sources": [], "status": "draft"
    }

def convert_workflow(task):
    item = dict(task)
    old_level = item.get("content_level", "workflow")
    item["entity_type"] = "troubleshooting" if old_level == "troubleshooting" else "task"
    item["related_entities"] = item.pop("related_tasks", item.get("related_entities", []))
    item["tags_ar"] = unique(item.get("tags_ar", []) + (["حل مشكلة"] if item["entity_type"] == "troubleshooting" else ["مسار عملي"]))
    inferred = []
    for step in item.get("steps", []):
        name = first_command_name(step.get("command"))
        if name in COMMAND_PAGE_MAP:
            inferred.append(COMMAND_PAGE_MAP[name])
    item["related_entities"] = unique(item.get("related_entities", []) + inferred)
    return item

def main():
    old = json.loads(COMMANDS_FILE.read_text(encoding="utf-8"))
    workflows = json.loads(WORKFLOWS_FILE.read_text(encoding="utf-8"))
    seed = json.loads(ENTITIES_FILE.read_text(encoding="utf-8"))

    categories = dict(old.get("categories", {}))
    categories.update(workflows.get("categories", {}))
    categories.update(seed.get("categories", {}))

    curated_tasks = [convert_workflow(item) for item in workflows.get("tasks", [])]
    legacy_tasks = [convert_legacy(item) for item in old.get("commands", [])]
    curated_entities = seed.get("entities", [])
    entities = curated_tasks + legacy_tasks + curated_entities

    ids = {item["id"] for item in entities}
    if len(ids) != len(entities):
        raise ValueError("Duplicate entity ids")

    # Remove dangling relation ids and add reverse references for navigation.
    for item in entities:
        item["related_entities"] = unique(x for x in item.get("related_entities", []) if x in ids and x != item["id"])
    by_id = {item["id"]: item for item in entities}
    for item in list(entities):
        for target_id in item.get("related_entities", []):
            target = by_id[target_id]
            reverse = target.setdefault("related_entities", [])
            if item["id"] not in reverse and len(reverse) < 20:
                reverse.append(item["id"])

    output = {
        "schema_version": "3.0.0",
        "project": "RHEL Arabic Knowledge Engine",
        "language": "ar",
        "baseline": old.get("baseline", "Red Hat Enterprise Linux 9"),
        "supported_versions": old.get("supported_versions", ["8", "9", "10"]),
        "entity_types": seed.get("entity_types", {}),
        "categories": categories,
        "entities": entities
    }
    OUTPUT_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    from collections import Counter
    counts = Counter(item["entity_type"] for item in entities)
    print(f"Created {OUTPUT_FILE}")
    print(f"Total entities: {len(entities)}")
    for key, value in counts.items():
        print(f"- {key}: {value}")

if __name__ == "__main__":
    main()
