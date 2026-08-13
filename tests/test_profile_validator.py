from __future__ import annotations

from pathlib import Path
import json
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ProfileValidatorTests(unittest.TestCase):
    def test_validator_writes_machine_readable_report(self) -> None:
        report = ROOT / "reports" / "character-profile-validation.json"
        if report.exists():
            report.unlink()
        result = subprocess.run(
            [sys.executable, "tools/validate_character_profiles.py"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        data = json.loads(report.read_text(encoding="utf-8"))
        self.assertEqual(data["profile_count"], 153)
        self.assertEqual(data["errors"], [])
        self.assertIn("low_confidence", data)


if __name__ == "__main__":
    unittest.main()
