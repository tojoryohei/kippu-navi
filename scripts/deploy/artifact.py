"""公開ジョブではcontrol_shaのこのコードだけで成果物を検証・展開する。"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import shutil
import tarfile


def digest(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def identity():
    result = {key: os.environ[key] for key in ("TARGET_SHA", "CONTROL_SHA", "DEPLOY_ENVIRONMENT")}
    if any(not re.fullmatch(r"[a-f0-9]{40}", result[key]) for key in ("TARGET_SHA", "CONTROL_SHA")):
        raise ValueError("完全SHAが必要です")
    if result["DEPLOY_ENVIRONMENT"] not in ("staging", "production"):
        raise ValueError("公開環境が不正です")
    return result


def allowed(name, kind):
    if name == "manifest.json":
        return True
    if kind == "api":
        return name == "image.tar"
    if kind == "frontend":
        if name in ("worker/main.mjs", "static/.well-known/api-catalog", "static/.well-known/apple-app-site-association", "static/.well-known/traffic-advice"):
            return True
        if not name.startswith("static/") or name.endswith(".map") or PurePosixPath(name).name in ("package.json", "package-lock.json", "wrangler.json", "wrangler.jsonc"):
            return False
        path = PurePosixPath(name)
        return path.name in ("_headers", "robots.txt", "llms.txt", "ads.txt") or path.suffix in {
            ".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".txt", ".xml",
            ".wasm", ".bin", ".woff", ".woff2", ".ttf", ".png", ".ico", ".svg", ".webp", ".jpg", ".jpeg", ".avif", ".gif", ".md",
        }
    return name.startswith("sourcemaps/") and PurePosixPath(name).suffix in (".js", ".mjs", ".map")


def safe_name(name):
    path = PurePosixPath(name)
    return bool(name) and not path.is_absolute() and ".." not in path.parts and "\\" not in name and str(path) == name and not any(part.startswith(".") and not (part == ".well-known" and index == 1 and path.parts[0] == "static") for index, part in enumerate(path.parts))


def pack(kind, source, archive):
    metadata = identity() | {"kind": kind, "run_id": os.environ["GITHUB_RUN_ID"], "run_attempt": os.environ["GITHUB_RUN_ATTEMPT"], "release": os.environ.get("RELEASE", "")}
    files = {}
    for path in sorted(source.rglob("*")):
        if path.is_symlink() or not (path.is_dir() or path.is_file()):
            raise ValueError(f"リンク・特殊ファイルは許可しません: {path}")
        if path.is_dir():
            continue
        name = path.relative_to(source).as_posix()
        if not safe_name(name) or not allowed(name, kind) or name == "manifest.json":
            raise ValueError(f"許可しない成果物パスです: {name}")
        files[name] = digest(path)
    if not files:
        raise ValueError("成果物が空です")
    metadata["files"] = files
    (source / "manifest.json").write_text(json.dumps(metadata, sort_keys=True) + "\n")
    with tarfile.open(archive, "w:gz", format=tarfile.USTAR_FORMAT) as tar:
        for name in [*files, "manifest.json"]:
            info = tar.gettarinfo(source / name, arcname=name)
            info.mode = 0o644
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            with open(source / name, "rb") as stream:
                tar.addfile(info, stream)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"{kind}_sha256={digest(archive)}\n")


def verify(kind, archive, destination):
    expected = os.environ["EXPECTED_SHA256"]
    if not re.fullmatch(r"[a-f0-9]{64}", expected) or digest(archive) != expected:
        raise ValueError("成果物アーカイブのSHA-256が一致しません")
    if destination.exists():
        raise ValueError("展開先は新規ディレクトリである必要があります")
    with tarfile.open(archive, "r:gz") as tar:
        members = tar.getmembers()
        names = set()
        total = 0
        for member in members:
            if not safe_name(member.name) or not allowed(member.name, kind) or member.name in names:
                raise ValueError(f"不正・重複パスです: {member.name}")
            if not member.isfile() or member.mode & 0o7111:
                raise ValueError(f"通常の非実行ファイルだけを許可します: {member.name}")
            total += member.size
            if total > 8 * 1024**3 or len(members) > 30000:
                raise ValueError("成果物が上限を超えています")
            names.add(member.name)
        if "manifest.json" not in names:
            raise ValueError("manifestがありません")
        manifest_member = tar.getmember("manifest.json")
        if manifest_member.size > 8 * 1024**2:
            raise ValueError("manifestが上限を超えています")
        manifest = json.load(tar.extractfile(manifest_member))
        expected_identity = identity() | {"kind": kind, "run_id": os.environ["GITHUB_RUN_ID"], "run_attempt": os.environ["EXPECTED_ATTEMPT"], "release": os.environ.get("RELEASE", "")}
        if any(manifest.get(key) != value for key, value in expected_identity.items()):
            raise ValueError("成果物のSHA・環境・生成run・releaseが一致しません")
        if set(manifest.get("files", {})) != names - {"manifest.json"}:
            raise ValueError("manifestのファイル一覧が一致しません")
        for member in members:
            if member.name == "manifest.json":
                continue
            if hashlib.file_digest(tar.extractfile(member), "sha256").hexdigest() != manifest["files"][member.name]:
                raise ValueError(f"ファイルのSHA-256が一致しません: {member.name}")
        required = {"frontend": {"static/index.html", "static/deployment.json", "static/pwa-assets.json", "static/sw.js", "worker/main.mjs"}, "api": {"image.tar"}}.get(kind, set())
        if not required <= names or (kind == "sentry" and not any(name.endswith(".map") for name in names)):
            raise ValueError("必須成果物がありません")
        # extractallを使わず、検証済みの通常ファイルのみ新規の展開先に書く。
        destination.mkdir(parents=True)
        for member in members:
            path = destination / member.name
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "xb") as output:
                shutil.copyfileobj(tar.extractfile(member), output)
            path.chmod(0o644)
    if kind == "frontend":
        deployment = json.loads((destination / "static/deployment.json").read_text())
        if deployment["commit"] != os.environ["TARGET_SHA"] or deployment["environment"] != os.environ["DEPLOY_ENVIRONMENT"]:
            raise ValueError("deployment.jsonが公開対象と一致しません")


if __name__ == "__main__":
    command, artifact_kind, source_path, output_path = sys.argv[1:]
    if artifact_kind not in ("frontend", "sentry", "api"):
        raise ValueError("成果物種別が不正です")
    {"pack": pack, "verify": verify}[command](artifact_kind, Path(source_path), Path(output_path))
