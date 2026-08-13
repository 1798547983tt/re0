from __future__ import annotations

from pathlib import Path
import json
import unittest


ROOT = Path(__file__).resolve().parents[1]


class EvidenceIndexContractTests(unittest.TestCase):
    def test_index_records_primary_source_and_uncertainty(self) -> None:
        path = ROOT / "data" / "character_evidence.json"
        self.assertTrue(path.exists(), "run tools/build_character_evidence.py first")
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertIn("菜月昴", data)
        self.assertIn("sources", data["菜月昴"])
        self.assertTrue(any(item["source_kind"] == "正传原文" for item in data["菜月昴"]["sources"]))
        self.assertIn(data["八重·天膳"]["confidence"], {"low", "medium", "high"})
        self.assertTrue(any(item["source_kind"] == "战力参考" for item in data["菜月昴"]["sources"]))
        self.assertEqual(data["菜月昴"]["confidence"], "high")


if __name__ == "__main__":
    unittest.main()
