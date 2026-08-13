from __future__ import annotations

import importlib.util
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GENERATOR = ROOT / "tools" / "generate_character_profiles.py"


def load_generator() -> Any:
    spec = importlib.util.spec_from_file_location("profile_generator", GENERATOR)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {GENERATOR}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SOURCE_ALIASES: dict[str, list[str]] = {
    "菜月昴": ["菜月昴", "菜月·昴", "昴"],
    "艾米莉亚": ["爱蜜莉雅", "艾米莉亚", "艾蜜莉雅", "银发少女"],
    "莱茵哈鲁特·范·阿斯特雷亚": ["莱因哈鲁特", "莱茵哈鲁特"],
    "莎提拉": ["莎缇拉", "莎提拉", "嫉妒魔女"],
    "贝亚特丽丝": ["碧翠丝", "贝阿特丽丝", "贝亚特丽丝"],
    "加菲尔·汀泽尔": ["嘉飞尔", "加菲尔", "嘉飞尔·闵"],
    "法兰德丽卡·鲍曼": ["法兰黛莉卡", "法兰德丽卡", "弗雷德莉卡"],
    "尤里乌斯·尤克历乌斯": ["由里乌斯", "尤里乌斯"],
    "菲利克斯·阿盖尔": ["菲莉丝", "菲利克斯"],
    "特蕾西亚·范·阿斯特雷亚": ["特蕾希雅", "特蕾西亚"],
    "梅佐里亚": ["梅佐雷亚", "梅佐里亚"],
    "塔莉塔": ["塔立塔", "塔莉塔"],
    "托德·芬格": ["陶德·方克", "陶德", "托德"],
    "瑟希鲁斯·塞格姆多": ["瑟希鲁斯", "塞西鲁斯", "瑟希鲁斯·塞格姆多"],
    "玛德琳·恩夏尔德": ["玛德琳", "梅德琳"],
    "巫它卡它": ["巫它卡它", "巫塔卡塔"],
    "琉兹·梅耶尔": ["琉兹", "琉兹·梅耶尔", "琉兹复制体"],
    "露伊·亚尔聂博": ["鲁伊", "露伊", "露伊·亚尔聂博"],
    "阿尔·迪巴兰": ["阿尔·迪巴兰", "阿尔德巴兰", "阿尔迪巴兰", "阿尔"],
    "雷德·阿斯特雷亚": ["雷伊德", "雷伊德·阿斯特雷亚", "雷德"],
    "培提尔其乌斯·罗曼尼康帝": ["贝特鲁吉乌斯", "培提尔其乌斯"],
    "西里乌斯·罗曼尼康帝": ["叙吕厄斯", "西里乌斯"],
    "卡佩拉·艾美拉达·露格尼卡": ["卡佩菈", "卡佩拉"],
    "尤尔娜·米希格蕾": ["夜鸣·魅时雨", "夜鸣", "尤尔娜"],
    "马可仕·吉尔达库": ["马可仕"],
    "罗兹瓦尔·L·梅扎斯": ["罗兹瓦尔"],
    "威尔海姆·范·阿斯特雷亚": ["威尔海姆"],
    "库珥修·卡尔斯腾": ["库珥修"],
    "普莉希拉·跋利耶尔": ["普莉希拉"],
    "安娜塔西亚·合辛": ["安娜塔西亚"],
    "弗洛普": ["弗洛普", "浮洛普"],
    "阿贝尔": ["阿贝尔", "亚伯", "文森·亚伯克斯"],
    "赫克托尔": ["赫克托尔", "赫克特"],
    "塞赫麦特": ["塞赫麦特", "赛赫麦特"],
    "梅拉奎拉": ["梅拉奎拉", "梅拉克耶拉"],
    "罗伊·阿尔法鲁多": ["罗伊·阿尔法鲁多", "罗伊·爱尔法德", "罗伊"],
    "罗安·赛格蒙特": ["罗安", "劳安"],
    "坦萨": ["坦萨", "貚纱"],
    "蜜蜜·帕尔巴顿": ["蜜蜜", "咪咪"],
    "贾马尔·奥雷利": ["贾马尔"],
    "格林·法先": ["格林"],
}


def chapter_heading(line: str) -> bool:
    stripped = line.strip()
    return bool(re.match(r"^(?:第[一二三四五六七八九十百0-9]+卷\s*)?(?:序章|终章|第[一二三四五六七八九十百0-9]+章|间章|短篇)", stripped))


def chapter_title(line: str, volume: str) -> str:
    stripped = line.strip()
    return stripped if stripped else volume


def alias_map(module: Any) -> dict[str, list[str]]:
    names = set(module.CORE_NAMES) | set(module.RANK_MAP) | set(module.PEOPLE)
    result: dict[str, set[str]] = {name: {name} for name in names}
    for alias, canonical in module.ALIASES.items():
        if canonical in result:
            result[canonical].add(alias)
    for canonical, aliases in SOURCE_ALIASES.items():
        result.setdefault(canonical, {canonical}).update(aliases)
    # One-character aliases are too ambiguous; two-character aliases are allowed
    # and filtered against longer aliases during scanning.
    return {name: sorted(values, key=lambda value: (-len(value), value)) for name, values in result.items()}


def scan_primary(names_to_aliases: dict[str, list[str]]) -> dict[str, list[dict[str, Any]]]:
    reverse: dict[str, set[str]] = defaultdict(set)
    for canonical, aliases in names_to_aliases.items():
        for alias in aliases:
            if len(alias) >= 2:
                reverse[alias].add(canonical)
    aliases = sorted(reverse, key=lambda item: (-len(item), item))
    pattern = re.compile("|".join(re.escape(alias) for alias in aliases))
    longer_aliases = [alias for alias in aliases if len(alias) >= 3]
    found: dict[str, list[dict[str, Any]]] = defaultdict(list)
    context_counts: dict[tuple[str, str, str], int] = defaultdict(int)
    volumes = sorted((ROOT / "正传").glob("*.txt"))
    for volume in volumes:
        chapter = volume.stem
        for line_number, line in enumerate(volume.read_text(encoding="utf-8").splitlines(), start=1):
            if chapter_heading(line):
                chapter = chapter_title(line, volume.stem)
            matches = pattern.findall(line)
            if not matches:
                continue
            # Keep a short, line-level anchor so the generated role card can
            # point to an actionable piece of the primary text.  Do not copy
            # paragraphs: the anchor is only a locator and a prompt seed.
            excerpt = re.sub(r"\s+", " ", line.strip())
            if len(excerpt) > 180:
                excerpt = excerpt[:177] + "…"
            # Long, unambiguous names are useful for detecting who is acting
            # in the same scene.  Short aliases are deliberately excluded.
            cooccurring = sorted({
                other
                for other_alias in set(matches)
                if len(other_alias) >= 3
                for other in reverse[other_alias]
            })
            for alias in set(matches):
                if len(alias) == 2 and any(alias in longer and longer in line for longer in longer_aliases):
                    continue
                for canonical in reverse[alias]:
                    bucket = found[canonical]
                    if len(bucket) >= 40:
                        continue
                    context_key = (canonical, volume.name, chapter)
                    # Avoid filling the evidence budget with one introductory
                    # scene; retain several lines per chapter so stage and
                    # relationship anchors span the volume where possible.
                    if context_counts[context_key] >= 8:
                        continue
                    bucket.append({
                        "source_kind": "正传原文",
                        "volume": volume.name,
                        "chapter": chapter,
                        "line": line_number,
                        "matched_as": alias,
                        "excerpt": excerpt,
                        "cooccurring": cooccurring,
                    })
                    context_counts[context_key] += 1
    return found


def summary_sources(names_to_aliases: dict[str, list[str]]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    summary_dir = ROOT / "剧情总结"
    for path in sorted(summary_dir.glob("*.txt")):
        text = path.read_text(encoding="utf-8")
        for canonical, aliases in names_to_aliases.items():
            if any(alias in text for alias in aliases if len(alias) >= 2):
                result[canonical].append({"source_kind": "总结索引", "volume": path.name})
    return result


def battle_sources(module: Any, names_to_aliases: dict[str, list[str]]) -> dict[str, list[dict[str, Any]]]:
    text = (ROOT / "战力参考.txt").read_text(encoding="utf-8")
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for canonical, aliases in names_to_aliases.items():
        matched = next((alias for alias in aliases if alias in text), None)
        if matched:
            result[canonical].append({"source_kind": "战力参考", "file": "战力参考.txt", "matched_as": matched, "note": "个人观点，仅用于阶位输入"})
    return result


def confidence(primary: list[dict[str, Any]]) -> str:
    volumes = {item["volume"] for item in primary}
    chapters = {(item.get("volume"), item.get("chapter")) for item in primary}
    # Repeated hits in one line/chapter are not enough to call a character
    # high-confidence.  Require either spread across volumes or a substantial
    # number of distinct chapter contexts.
    if len(volumes) >= 3 or (len(primary) >= 20 and len(chapters) >= 3):
        return "high"
    if primary and (len(volumes) >= 2 or len(chapters) >= 2):
        return "medium"
    return "low"


def main() -> None:
    module = load_generator()
    aliases = alias_map(module)
    primary = scan_primary(aliases)
    summaries = summary_sources(aliases)
    battles = battle_sources(module, aliases)
    data: dict[str, dict[str, Any]] = {}
    for name in sorted(aliases):
        sources = primary.get(name, []) + summaries.get(name, [])[:8] + battles.get(name, [])
        data[name] = {
            "canonical_name": name,
            "aliases": aliases[name],
            "confidence": confidence(primary.get(name, [])),
            "primary_hit_count": len(primary.get(name, [])),
            "primary_volume_count": len({item["volume"] for item in primary.get(name, [])}),
            "primary_chapter_count": len({(item.get("volume"), item.get("chapter")) for item in primary.get(name, [])}),
            "sources": sources,
        }
    DATA.mkdir(exist_ok=True)
    (DATA / "character_aliases.json").write_text(json.dumps(aliases, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "character_evidence.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"indexed {len(data)} names; primary hits={sum(item['primary_hit_count'] for item in data.values())}")


if __name__ == "__main__":
    main()
