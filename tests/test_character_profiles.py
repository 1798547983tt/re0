from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = ROOT / "人物人设"


class DetailedProfileContractTests(unittest.TestCase):
    def test_representative_profiles_have_actionable_detail(self) -> None:
        names = [
            "菜月昴",
            "艾米莉亚",
            "雷姆",
            "帕克",
            "贝亚特丽丝",
            "阿尔·迪巴兰",
        ]
        required = [
            "核心欲望：",
            "恐惧与底线：",
            "场景反应：",
            "知识边界：",
            "战斗决策：",
            "失败反应：",
            "口吻示例：",
            "阶段切换条件：",
            "证据类型：",
        ]
        for name in names:
            text = (PROFILE_DIR / f"{name}.txt").read_text(encoding="utf-8")
            body = re.sub(r"^<[^>]+>\r?\n|\r?\n</[^>]+>\s*$", "", text)
            self.assertGreaterEqual(len(body.replace("\n", "")), 1800, name)
            for field in required:
                self.assertIn(field, text, f"{name} missing {field}")

    def test_every_profile_has_single_matching_outer_tag(self) -> None:
        files = [p for p in PROFILE_DIR.glob("*.txt") if p.name != "README.txt"]
        self.assertEqual(len(files), 153)
        for path in files:
            text = path.read_text(encoding="utf-8")
            first = text.splitlines()[0]
            self.assertRegex(first, r"^<[^<>]+>$", path.name)
            name = first[1:-1]
            self.assertEqual(text.count(first), 1, path.name)
            self.assertEqual(text.count(f"</{name}>"), 1, path.name)


if __name__ == "__main__":
    unittest.main()
