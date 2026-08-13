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
        ]
        for name in names:
            text = (PROFILE_DIR / f"{name}.txt").read_text(encoding="utf-8")
            body = re.sub(r"^<[^>]+>\r?\n|\r?\n</[^>]+>\s*$", "", text)
            self.assertGreaterEqual(len(body.replace("\n", "")), 2000, name)
            self.assertLessEqual(len(body.replace("\n", "")), 3500, name)
            for field in required:
                self.assertIn(field, text, f"{name} missing {field}")

    def test_profiles_contain_roleplay_content_not_audit_metadata(self) -> None:
        forbidden = (
            "年龄阶段：原文未给出绝对年龄",
            "装备与战斗方式：以原文明确",
            "原文行为锚点：",
            "同场人物线索：",
            "原文事实层：",
            "原文依据：",
            "证据类型：",
            "资料置信度：",
            "存疑项：",
            "战力口径：",
            "战力依据：",
            "扮演协议：",
            "阶段索引：",
            "项目资料不足",
            "来源定位：",
            "原文",
            "资料置信度",
            "证据",
            "待核验",
            "战力参考",
            "个人观点",
            "总结索引",
            "审计",
        )
        files = [p for p in PROFILE_DIR.glob("*.txt") if p.name != "README.txt"]
        self.assertEqual(len(files), 153)
        for path in files:
            text = path.read_text(encoding="utf-8")
            for marker in forbidden:
                self.assertNotIn(marker, text, f"{path.name} retained audit marker {marker}")

    def test_profiles_keep_operational_roleplay_rules(self) -> None:
        required = ("互动决策：", "情绪变化：", "关系推进：", "危险禁区：", "优先级与代价：")
        files = [p for p in PROFILE_DIR.glob("*.txt") if p.name != "README.txt"]
        for path in files:
            text = path.read_text(encoding="utf-8")
            for marker in required:
                self.assertIn(marker, text, f"{path.name} missing actionable rule {marker}")

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
