#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from publication_bundle import file_names, pack, read_bundle, unpack, validate_payload


class PublicationBundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.date = "2026-10-12"
        self.latest, self.archive, self.research = file_names(self.date)
        data = json.dumps({"date": self.date, "contests": []}).encode()
        evidence = json.dumps({"date": self.date, "completedAt": "2026-10-12T10:00:00+09:00"}).encode()
        self.payload = {self.latest: data, self.archive: data, self.research: evidence}
        for name, contents in self.payload.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)

    def args(self, out):
        return argparse.Namespace(date=self.date, latest=self.root / self.latest,
                                  archive=self.root / self.archive, research=self.root / self.research,
                                  baseline=self.root / self.latest, out=out)

    def make_bundle(self):
        bundle = self.root / "candidate.zip"
        with patch("publication_bundle.validate_editorial_audit") as validate:
            pack(self.args(bundle))
            validate.assert_called_once()
        return bundle

    def test_verified_round_trip_and_fresh_restore(self):
        bundle = self.make_bundle()
        receipt, extracted = read_bundle(bundle)
        self.assertEqual(receipt["date"], self.date)
        self.assertEqual(extracted, self.payload)
        restored = self.root / "restored"
        with patch("publication_bundle.validate_editorial_audit"):
            unpack(argparse.Namespace(bundle=bundle, date=self.date,
                                      baseline=self.root / self.latest, into=restored))
        for name, contents in self.payload.items():
            self.assertEqual((restored / name).read_bytes(), contents)
        with patch("publication_bundle.validate_editorial_audit"):
            with self.assertRaises(FileExistsError):
                unpack(argparse.Namespace(bundle=bundle, date=self.date,
                                          baseline=self.root / self.latest, into=restored))

    def test_refuse_partial_or_mismatched_snapshot(self):
        with self.assertRaises(ValueError):
            validate_payload(self.date, {self.latest: self.payload[self.latest]})
        with self.assertRaises(ValueError):
            validate_payload(self.date, {**self.payload, self.archive: b"{}"})
        with self.assertRaises(ValueError):
            validate_payload(self.date, {**self.payload, self.research: b'{"date":"2026-10-11"}'})

    def test_refuse_modified_or_extra_archive_members(self):
        bundle = self.make_bundle()
        with self.assertRaises(FileExistsError):
            with patch("publication_bundle.validate_editorial_audit"):
                pack(self.args(bundle))
        corrupt = self.root / "corrupt.zip"
        with ZipFile(bundle) as source, ZipFile(corrupt, "w") as target:
            for info in source.infolist():
                raw = source.read(info.filename)
                target.writestr(info.filename, b'{"date":"2026-10-12"}' if info.filename == self.research else raw)
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            read_bundle(corrupt)
        unexpected = self.root / "unexpected.zip"
        with ZipFile(bundle) as source, ZipFile(unexpected, "w") as target:
            for info in source.infolist():
                target.writestr(info.filename, source.read(info.filename))
            target.writestr("malicious.txt", "ignored")
        with self.assertRaises(ValueError):
            read_bundle(unexpected)

    def test_restore_write_error_leaves_no_partial_destination(self):
        bundle = self.make_bundle()
        target = self.root / "must-not-exist-after-error"
        with patch("publication_bundle.validate_editorial_audit"), patch.object(Path, "write_bytes", side_effect=OSError("disk failure")):
            with self.assertRaisesRegex(OSError, "disk failure"):
                unpack(argparse.Namespace(bundle=bundle, date=self.date,
                                          baseline=self.root / self.latest, into=target))
        self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
