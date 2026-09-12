import os

# Comma-separated list of allowed frontend origins. Set via env var in
# production (Render dashboard); defaults cover local Next.js dev.
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ml", "artifacts")

# Free key from https://openchargemap.org/site/loginprovider/register (~1 minute,
# no cost). Kept server-side deliberately: a key embedded in public frontend JS is
# scrapable, and OpenChargeMap's own terms ask that server-side keys stay server-side.
OPENCHARGEMAP_API_KEY = os.environ.get("OPENCHARGEMAP_API_KEY")
