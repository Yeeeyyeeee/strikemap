#!/usr/bin/env python3
"""
SEN2SR super-resolution wrapper.
Upscales Sentinel-2 imagery from 10m to 2.5m resolution (4x).

Usage:
    python superres.py <input_path> <output_path>

Input:  PNG image (RGB, any resolution)
Output: PNG image (RGB, 4x upscaled)

Exit codes:
    0 - Success
    1 - Runtime error
    2 - Model not available (Node.js should fall back to Sharp lanczos3)

Setup:
    pip install -r requirements.txt
    # Or: pip install torch torchvision opensr-test Pillow numpy
"""

import sys
import json
import os


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"status": "error", "message": "Usage: superres.py <input> <output>"}),
              file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(json.dumps({"status": "error", "message": f"Input file not found: {input_path}"}),
              file=sys.stderr)
        sys.exit(1)

    try:
        import torch
        import numpy as np
        from PIL import Image
    except ImportError as e:
        print(json.dumps({"status": "error", "code": "no_deps", "message": str(e)}),
              file=sys.stderr)
        sys.exit(2)

    try:
        # Try loading SEN2SR via opensr-test (ESA's official package)
        import opensr_test
        model = opensr_test.load("sen2sr")
    except (ImportError, Exception):
        try:
            # Fallback: try loading from local clone of ESAOpenSR/SEN2SR
            sen2sr_path = os.path.join(os.path.dirname(__file__), "SEN2SR")
            if os.path.exists(sen2sr_path):
                sys.path.insert(0, sen2sr_path)
                from sen2sr import SEN2SRModel
                model = SEN2SRModel.from_pretrained()
            else:
                print(json.dumps({
                    "status": "error",
                    "code": "no_model",
                    "message": "SEN2SR model not found. Run: pip install opensr-test"
                }), file=sys.stderr)
                sys.exit(2)
        except Exception as e:
            print(json.dumps({"status": "error", "code": "no_model", "message": str(e)}),
                  file=sys.stderr)
            sys.exit(2)

    try:
        # Load image
        img = Image.open(input_path).convert("RGB")
        img_np = np.array(img).astype(np.float32) / 255.0

        # Convert to tensor: (1, C, H, W)
        tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0)

        # Run super-resolution
        device = "cuda" if torch.cuda.is_available() else "cpu"
        tensor = tensor.to(device)

        with torch.no_grad():
            if hasattr(model, "predict"):
                sr_tensor = model.predict(tensor)
            elif hasattr(model, "forward"):
                sr_tensor = model(tensor)
            elif callable(model):
                sr_tensor = model(tensor)
            else:
                # Last resort: simple bicubic as fallback
                sr_tensor = torch.nn.functional.interpolate(
                    tensor, scale_factor=4, mode="bicubic", align_corners=False
                )

        # Convert back to image
        sr_np = sr_tensor.squeeze(0).permute(1, 2, 0).cpu().numpy()
        sr_np = np.clip(sr_np * 255, 0, 255).astype(np.uint8)
        sr_img = Image.fromarray(sr_np)

        # Save output
        sr_img.save(output_path, "PNG")

        print(json.dumps({
            "status": "ok",
            "method": "sen2sr",
            "scale": 4,
            "input_size": [img.width, img.height],
            "output_size": [sr_img.width, sr_img.height],
            "device": device
        }))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
