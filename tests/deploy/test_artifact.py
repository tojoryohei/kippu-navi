"""資格情報付与前に成果物を拒否できることを確認する。"""
import importlib.util
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

    def verify(self):
        artifact.verify("api", self.archive, self.root / "verified")

    def rewrite(self, extra=None, alter=None):
        with tarfile.open(self.archive) as tar:
            files = [(member, tar.extractfile(member).read()) for member in tar.getmembers()]
        with tarfile.open(self.archive, "w:gz") as tar:
            for member, data in files:
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
        for key, value in [("TARGET_SHA", "c" * 40), ("CONTROL_SHA", "d" * 40), ("DEPLOY_ENVIRONMENT", "production"), ("EXPECTED_ATTEMPT", "2"), ("GITHUB_RUN_ID", "11")]:
            with self.subTest(key=key), patch.dict(os.environ, {key: value}):
                with self.assertRaisesRegex(ValueError, "一致しません"):
                    self.verify()

    def test_payload_checksum_mismatch(self):
        self.rewrite(alter=lambda name, data: b"changed" if name == "image.tar" else data)
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.verify()

    def test_unsafe_members(self):
        original = self.archive.read_bytes()
        for name, kind, mode in [("../image.tar", tarfile.REGTYPE, 0o644), ("/image.tar", tarfile.REGTYPE, 0o644), ("image.tar", tarfile.REGTYPE, 0o644), ("script.sh", tarfile.REGTYPE, 0o644), ("manifest.json", tarfile.SYMTYPE, 0o644), ("manifest.json", tarfile.FIFOTYPE, 0o644), ("manifest.json", tarfile.REGTYPE, 0o755)]:
            with self.subTest(name=name, kind=kind, mode=mode):
                self.archive.write_bytes(original)
                member = tarfile.TarInfo(name)
                member.type = kind
                member.mode = mode
                member.linkname = "../../outside" if kind == tarfile.SYMTYPE else ""
                self.rewrite(extra=member)
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

    def test_pack_rejects_symlink(self):
        (self.source / "image.tar").unlink()
        (self.source / "image.tar").symlink_to(self.root / "output")
        with self.assertRaisesRegex(ValueError, "リンク"):
            artifact.pack("api", self.source, self.archive)

    def test_frontend_paths(self):
        for name in ["static/package.json", "static/file.map", "static/deploy.sh", "worker/config.json"]:
            self.assertFalse(artifact.allowed(name, "frontend"))
        self.assertTrue(artifact.allowed("static/_astro/app.js", "frontend"))
        self.assertTrue(artifact.allowed("worker/main.mjs", "frontend"))


if __name__ == "__main__":
    unittest.main()
