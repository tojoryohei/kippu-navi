"""資格情報付与前に成果物を拒否できることを確認する。"""
import importlib.util
import hashlib
import json
import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("artifact", Path(__file__).parents[2] / "scripts/deploy/artifact.py")
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)


class ArtifactTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        (self.source / "image.tar").write_bytes(b"docker image archive")
        self.env = patch.dict(os.environ, {
            "TARGET_SHA": "a" * 40, "CONTROL_SHA": "b" * 40,
            "DEPLOY_ENVIRONMENT": "staging", "GITHUB_RUN_ID": "10",
            "GITHUB_RUN_ATTEMPT": "1", "EXPECTED_ATTEMPT": "1",
            "GITHUB_OUTPUT": str(self.root / "output"), "RELEASE": "",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.archive = self.root / "api.tgz"
        artifact.pack("api", self.source, self.archive)
        os.environ["EXPECTED_SHA256"] = artifact.digest(self.archive)

    def verify(self, kind="api"):
        artifact.verify(kind, self.archive, self.root / "verified")

    def rewrite(self, extra=None, alter=None, replace=False):
        with tarfile.open(self.archive) as tar:
            files = [(member, tar.extractfile(member).read()) for member in tar.getmembers()]
        with tarfile.open(self.archive, "w:gz") as tar:
            for member, data in files:
                if replace and extra and member.name == extra.name:
                    continue
                if alter:
                    data = alter(member.name, data)
                    member.size = len(data)
                tar.addfile(member, io.BytesIO(data))
            if extra:
                tar.addfile(extra, io.BytesIO(b""))
        # 外側のハッシュも一致する攻撃入力を作り、内側の検証を試す。
        os.environ["EXPECTED_SHA256"] = artifact.digest(self.archive)

    def test_valid_and_downstream_rerun(self):
        os.environ["GITHUB_RUN_ATTEMPT"] = "2"
        self.verify()
        self.assertEqual((self.root / "verified/image.tar").read_bytes(), b"docker image archive")

    def test_archive_checksum_mismatch(self):
        os.environ["EXPECTED_SHA256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.verify()

    def test_wrong_identity(self):
        for key, value in [("TARGET_SHA", "c" * 40), ("CONTROL_SHA", "d" * 40), ("DEPLOY_ENVIRONMENT", "production"), ("EXPECTED_ATTEMPT", "2"), ("GITHUB_RUN_ID", "11"), ("RELEASE", "5.2.0+" + "e" * 40)]:
            with self.subTest(key=key), patch.dict(os.environ, {key: value}):
                with self.assertRaisesRegex(ValueError, "一致しません"):
                    self.verify()

    def test_payload_checksum_mismatch(self):
        self.rewrite(alter=lambda name, data: b"changed" if name == "image.tar" else data)
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.verify()

    def test_unsafe_members(self):
        original = self.archive.read_bytes()
        for name, kind, mode in [("../image.tar", tarfile.REGTYPE, 0o644), ("/image.tar", tarfile.REGTYPE, 0o644), ("image.tar", tarfile.REGTYPE, 0o644), ("script.sh", tarfile.REGTYPE, 0o644), ("manifest.json", tarfile.SYMTYPE, 0o644), ("manifest.json", tarfile.LNKTYPE, 0o644), ("manifest.json", tarfile.FIFOTYPE, 0o644), ("manifest.json", tarfile.REGTYPE, 0o755)]:
            with self.subTest(name=name, kind=kind, mode=mode):
                self.archive.write_bytes(original)
                member = tarfile.TarInfo(name)
                member.type = kind
                member.mode = mode
                member.linkname = "../../outside" if kind == tarfile.SYMTYPE else ""
                self.rewrite(extra=member, replace=kind != tarfile.REGTYPE or mode == 0o755)
                with self.assertRaises(ValueError):
                    self.verify()
                self.assertFalse((self.root / "verified").exists())

    def test_missing_manifest(self):
        with tarfile.open(self.archive, "w:gz") as tar:
            member = tarfile.TarInfo("image.tar")
            member.mode = 0o644
            tar.addfile(member, io.BytesIO(b""))
        os.environ["EXPECTED_SHA256"] = artifact.digest(self.archive)
        with self.assertRaisesRegex(ValueError, "manifest"):
            self.verify()

    def test_frontend_rejects_non_public_files(self):
        source = self.root / "frontend"
        files = {
            "static/index.html": "<html></html>",
            "static/deployment.json": json.dumps({"commit": "a" * 40, "environment": "staging"}),
            "static/pwa-assets.json": "{}",
            "static/sw.js": "",
            "worker/main.mjs": "export default {}",
        }
        for name, data in files.items():
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(data)
        artifact.pack("frontend", source, self.archive)
        os.environ["EXPECTED_SHA256"] = artifact.digest(self.archive)
        artifact.verify("frontend", self.archive, self.root / "accepted")
        original = self.archive.read_bytes()
        for name in ["static/package.json", "static/file.map", "static/deploy.sh", "worker/config.json"]:
            with self.subTest(name=name):
                self.archive.write_bytes(original)
                member = tarfile.TarInfo(name)
                member.mode = 0o644

                def add_to_manifest(path, data):
                    if path != "manifest.json":
                        return data
                    manifest = json.loads(data)
                    manifest["files"][name] = hashlib.sha256(b"").hexdigest()
                    return json.dumps(manifest).encode()

                # manifestもハッシュも整合させ、公開不可ファイルの混入だけを検証する。
                self.rewrite(extra=member, alter=add_to_manifest)
                with self.assertRaises(ValueError):
                    self.verify("frontend")
                self.assertFalse((self.root / "verified").exists())


if __name__ == "__main__":
    unittest.main()
