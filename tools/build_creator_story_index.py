"""Build the creator's read-only story-anchor index from 剧情总结."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "剧情总结"
OUTPUT = ROOT / "frontend" / "data" / "story-index.json"


def parse_time(line: str) -> dict[str, str]:
    parts = [part.strip() for part in line.removeprefix("时间：").split("；")]
    parts += [""] * (4 - len(parts))
    return {
        "time": " · ".join(part for part in parts[:4] if part),
        "date": parts[0],
        "period": parts[1],
        "layer": parts[2],
        "note": parts[3],
    }


def parse_volume(path: Path) -> dict:
    lines = path.read_text(encoding="utf-8").splitlines()
    joined = "\n".join(lines)
    title_match = re.search(r"<卷标题>(.*?)</卷标题>", joined)
    if not title_match:
        raise ValueError(f"missing volume title: {path}")

    events: list[dict] = []
    headings = list(enumerate(lines))
    for index, line in headings:
        match = re.match(r"^【事件(\d+)】(.+)$", line)
        if not match:
            continue
        time_line = next((candidate for candidate in lines[index + 1 : index + 6] if candidate.startswith("时间：")), "")
        description_line = next((candidate for candidate in lines[index + 1 : index + 8] if candidate.startswith("时间说明：")), "")
        time_data = parse_time(time_line) if time_line else {"time": "", "date": "", "period": "", "layer": "", "note": ""}
        event = {
            "id": int(match.group(1)),
            "title": match.group(2).strip(),
            **time_data,
            "timeDescription": description_line.removeprefix("时间说明：").strip(),
        }
        events.append(event)

    return {
        "number": int(re.search(r"\d+", path.stem).group()),
        "title": title_match.group(1).strip(),
        "displayTitle": events[0]["title"] if events else title_match.group(1).strip(),
        "events": events,
    }


def build() -> list[dict]:
    volumes = [parse_volume(path) for path in SOURCE_DIR.glob("第*卷.txt")]
    return sorted(volumes, key=lambda volume: volume["number"])


if __name__ == "__main__":
    data = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    event_count = sum(len(volume["events"]) for volume in data)
    print(f"wrote {len(data)} volumes / {event_count} events to {OUTPUT}")
