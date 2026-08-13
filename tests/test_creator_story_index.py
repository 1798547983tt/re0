from __future__ import annotations

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CreatorStoryIndexTests(unittest.TestCase):
    def test_index_covers_all_story_volumes_and_events(self) -> None:
        path = ROOT / "frontend" / "data" / "story-index.json"
        self.assertTrue(path.exists(), "run tools/build_creator_story_index.py first")
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(len(data), 39)
        self.assertEqual(sum(len(volume["events"]) for volume in data), 308)
        self.assertTrue(all(volume.get("displayTitle") for volume in data))
        self.assertTrue(all(event.get("time") and event.get("timeDescription") for volume in data for event in volume["events"]))


if __name__ == "__main__":
    unittest.main()
