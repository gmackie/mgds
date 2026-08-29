import json
import pathlib
import sys

PACKAGE = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(PACKAGE))

from mgds_protocol.generated import MgdsArtifact  # noqa: E402

fixture = json.loads(pathlib.Path("fixtures/v0/evidence.valid.json").read_text())["artifact"]
round_trip = MgdsArtifact(**json.loads(json.dumps(fixture)))
assert round_trip == fixture
print("python round-trip: stable")
