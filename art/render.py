"""Render art/cover.html to art/cover-light.jpg and art/cover-dark.jpg (3200x1800).

    python art/render.py

Needs Microsoft Edge (headless) and Pillow. Fonts load from Google Fonts, so be online.
"""

import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ART = Path(__file__).resolve().parent
EDGE = os.environ.get("EDGE", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")

for theme, query in (("light", ""), ("dark", "?theme=dark")):
    png = Path(tempfile.gettempdir()) / f"spoko-labels-cover-{theme}.png"
    subprocess.run(
        [
            EDGE,
            "--headless",
            "--hide-scrollbars",
            "--window-size=1600,900",
            "--force-device-scale-factor=2",
            "--virtual-time-budget=8000",
            f"--screenshot={png}",
            f"{(ART / 'cover.html').as_uri()}{query}",
        ],
        check=True,
    )
    Image.open(png).convert("RGB").save(ART / f"cover-{theme}.jpg", quality=88, optimize=True)
    png.unlink()
