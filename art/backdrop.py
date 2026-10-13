"""Paint the cover backdrops with a local ComfyUI (art/cover-backdrop-{light,dark}.jpg, 1600x900).

    python art/backdrop.py --ref path/to/b1-photo.jpg            # both themes, seed 7
    python art/backdrop.py --ref photo.jpg --theme dark --seed 42

FLUX.2 klein 9B (nvfp4, 6 steps) with Qwen3-8B as the text encoder and the Flux 2 VAE, the same
light graph as the filament-ops-notify thumbnail. --ref is a photo of the real printer, fed in as
a reference latent so the render keeps its shape. The title and chips are laid over the result by
art/cover.html, because the model garbles letters. ComfyUI is read from COMFY_URL
(default http://127.0.0.1:8188).
"""

import argparse
import json
import os
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ART = Path(__file__).resolve().parent
W, H = 1600, 900
COMFY = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
SCENE = {
    "light": (
        "Clean off-white background with a very light mint gradient, soft ambient occlusion, matte "
        "plastic materials, calm, spacious, product-render quality."
    ),
    "dark": (
        "Dark emerald-teal gradient studio background, deep green on the left to teal on the right, "
        "a soft glow of light behind the printer, soft shadow, matte plastic materials, calm, "
        "spacious, product-render quality."
    ),
}
PROMPT = (
    "Minimal isometric 3D illustration for a software product thumbnail, wide 16:9. On the right, "
    "the exact printer from the reference image, unchanged: same shape, same slate blue-grey body, "
    "same glossy black lid, same round power button. A short strip of white sticky labels with a "
    "black square QR-code pattern slides out of its front slot. From the lower left, a small "
    "rounded browser-window card with an emerald-green header bar floats along a curved dotted "
    "trail toward the printer, and one small round mint-green bubble with a bluetooth symbol "
    "hovers on the trail halfway. The top-left quarter of the image is empty for a title. "
    "{scene} "
    "no text, no letters, no words, no numbers, no logos, no watermark, no people."
)


def api(route, data=None, headers=None):
    req = urllib.request.Request(COMFY + route, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def upload(path):
    """Put the reference photo in ComfyUI's input folder and return its name."""
    boundary = "----spokolabels"
    name = "spoko-labels-ref" + Path(path).suffix
    head = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\n"
            "Content-Type: application/octet-stream\r\n\r\n").encode()
    tail = (f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue"
            f"\r\n--{boundary}--\r\n").encode()
    api("/upload/image", head + Path(path).read_bytes() + tail,
        {"content-type": f"multipart/form-data; boundary={boundary}"})
    return name


def paint(theme, seed, ref):
    gw, gh = 1600, 896  # klein wants multiples of 64; cropped to 16:9 below
    graph = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux-2-klein-9b-nvfp4.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_8b_fp8mixed.safetensors", "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": PROMPT.format(scene=SCENE[theme])}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "20": {"class_type": "LoadImage", "inputs": {"image": upload(ref)}},
        "21": {"class_type": "ImageScaleToTotalPixels", "inputs": {"image": ["20", 0], "upscale_method": "lanczos", "megapixels": 1.0, "resolution_steps": 1}},
        "22": {"class_type": "VAEEncode", "inputs": {"pixels": ["21", 0], "vae": ["3", 0]}},
        "23": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["4", 0], "latent": ["22", 0]}},
        "24": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["5", 0], "latent": ["22", 0]}},
        "6": {"class_type": "CFGGuider", "inputs": {"model": ["1", 0], "positive": ["23", 0], "negative": ["24", 0], "cfg": 1.0}},
        "7": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": gw, "height": gh, "batch_size": 1}},
        "8": {"class_type": "Flux2Scheduler", "inputs": {"steps": 6, "width": gw, "height": gh}},
        "9": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "10": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "11": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["10", 0], "guider": ["6", 0], "sampler": ["9", 0], "sigmas": ["8", 0], "latent_image": ["7", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": "spoko-labels/cover"}},
    }
    body = json.dumps({"prompt": graph, "client_id": "spoko-labels-cover"}).encode()
    pid = json.loads(api("/prompt", body, {"content-type": "application/json"}))["prompt_id"]
    print(f"{theme}: queued seed {seed} as {pid}", flush=True)

    for _ in range(300):
        time.sleep(4)
        entry = json.loads(api(f"/history/{pid}")).get(pid)
        if not entry:
            continue
        if entry.get("status", {}).get("status_str") == "error":
            sys.exit(f"ComfyUI failed: {json.dumps(entry['status'].get('messages'))[:800]}")
        if entry.get("outputs"):
            break
    else:
        sys.exit("timed out waiting for ComfyUI")

    image = next(i for o in entry["outputs"].values() for i in o.get("images", []))
    query = urllib.parse.urlencode({"filename": image["filename"], "subfolder": image.get("subfolder", ""), "type": image["type"]})
    raw = Path(tempfile.gettempdir()) / f"spoko-labels-cover-{theme}-raw.png"
    raw.write_bytes(api("/view?" + query))

    im = Image.open(raw).convert("RGB")
    nw = round(im.width * H / im.height)
    x = (nw - W) // 2
    out = ART / f"cover-backdrop-{theme}.jpg"
    im.resize((nw, H), Image.LANCZOS).crop((x, 0, x + W, H)).save(out, "JPEG", quality=92, optimize=True)
    print(f"wrote {out.name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True, help="photo of the real printer to base the render on")
    ap.add_argument("--theme", choices=["light", "dark"], help="default: both")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    for theme in [args.theme] if args.theme else ["light", "dark"]:
        paint(theme, args.seed, args.ref)


if __name__ == "__main__":
    main()
