from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = ROOT / "人物人设"
REPORT = ROOT / "reports" / "character-profile-validation.json"
REQUIRED = (
    "姓名：",
    "性别：",
    "身份与阵营：",
    "外在识别锚点：",
    "核心欲望：",
    "恐惧与底线：",
    "内在矛盾：",
    "关键关系与触发反应：",
    "知识边界：",
    "权能/加护/魔法/能力：",
    "场景反应：",
    "战斗决策：",
    "失败反应：",
    "战力等阶：",
    "阶段性人设：",
    "阶段切换条件：",
    "行为指导：",
    "口吻示例：",
    "原文依据：",
    "证据类型：",
    "资料置信度：",
)


def body_chars(text: str) -> int:
    lines = text.splitlines()
    if lines and re.fullmatch(r"<[^<>]+>", lines[0]):
        lines = lines[1:]
    if lines and re.fullmatch(r"</[^<>]+>", lines[-1]):
        lines = lines[:-1]
    return len("".join(lines))


def validate() -> dict:
    files = sorted(path for path in PROFILE_DIR.glob("*.txt") if path.name != "README.txt")
    errors: list[str] = []
    warnings: list[str] = []
    stats: list[dict] = []
    low_confidence: list[str] = []
    evidence_kinds: Counter[str] = Counter()
    template_lines: Counter[str] = Counter()
    for path in files:
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        first = lines[0] if lines else ""
        name = first[1:-1] if re.fullmatch(r"<[^<>]+>", first) else path.stem
        expected_close = f"</{name}>"
        if first != f"<{name}>" or text.count(expected_close) != 1:
            errors.append(f"{path.name}: outer tag mismatch")
        if path.stem != name:
            errors.append(f"{path.name}: filename/tag mismatch ({name})")
        for field in REQUIRED:
            if field not in text:
                errors.append(f"{path.name}: missing {field}")
        chars = body_chars(text)
        if chars < 2000 or chars > 3500:
            errors.append(f"{path.name}: body length {chars} outside 2000-3500")
        if "None" in text or "????" in text:
            errors.append(f"{path.name}: template/encoding leakage")
        rank_line = next((line for line in lines if line.startswith("战力等阶：")), "")
        if not re.search(r"[1-7]阶·(?:上位|下位)", rank_line):
            errors.append(f"{path.name}: invalid rank")
        confidence = next((line.split("：", 1)[1] for line in lines if line.startswith("资料置信度：")), "")
        if confidence.startswith("低"):
            low_confidence.append(name)
        kind = next((line.split("：", 1)[1] for line in lines if line.startswith("证据类型：")), "未知")
        evidence_kinds[kind] += 1
        for line in lines:
            if line and not line.startswith("<"):
                template_lines[line] += 1
        stats.append({"name": name, "chars": chars, "confidence": confidence, "evidence_type": kind})
    repeated = {line: count for line, count in template_lines.items() if count >= 140 and len(line) > 20}
    if repeated:
        warnings.append(f"{len(repeated)} lines appear in at least 140 profiles; review for non-actionable template text")
    report = {
        "profile_count": len(files),
        "character_count": {"min": min((item["chars"] for item in stats), default=0), "max": max((item["chars"] for item in stats), default=0), "average": round(sum(item["chars"] for item in stats) / len(stats), 1) if stats else 0},
        "low_confidence": sorted(low_confidence),
        "evidence_types": dict(evidence_kinds),
        "template_line_warnings": repeated,
        "warnings": warnings,
        "errors": errors,
        "profiles": stats,
    }
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    result = validate()
    print(json.dumps({key: result[key] for key in ("profile_count", "character_count", "low_confidence", "evidence_types", "warnings", "errors")}, ensure_ascii=False, indent=2))
    raise SystemExit(0 if not result["errors"] else 1)
