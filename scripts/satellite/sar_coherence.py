#!/usr/bin/env python3
"""
SAR coherence computation using SNAP/snapista.
Computes interferometric coherence between pre- and post-strike Sentinel-1 scenes
to detect structural damage on the ground.

Usage:
    python sar_coherence.py <before_path> <after_path> <output_path>

Input:  Two Sentinel-1 GRD images (PNG or TIFF, VV+VH composite)
Output: PNG coherence map (0=total decorrelation/change, 1=no change)

Requirements:
    - ESA SNAP installed (https://step.esa.int/main/download/snap-download/)
    - snapista Python package: pip install snapista
    - SNAP GPT available in PATH

Exit codes:
    0 - Success
    1 - Runtime error
    2 - SNAP/snapista not available
"""

import sys
import json
import os
import tempfile


def main():
    if len(sys.argv) < 4:
        print(json.dumps({
            "status": "error",
            "message": "Usage: sar_coherence.py <before> <after> <output>"
        }), file=sys.stderr)
        sys.exit(1)

    before_path = sys.argv[1]
    after_path = sys.argv[2]
    output_path = sys.argv[3]

    for p in [before_path, after_path]:
        if not os.path.exists(p):
            print(json.dumps({"status": "error", "message": f"File not found: {p}"}),
                  file=sys.stderr)
            sys.exit(1)

    try:
        import numpy as np
        from PIL import Image
    except ImportError as e:
        print(json.dumps({"status": "error", "code": "no_deps", "message": str(e)}),
              file=sys.stderr)
        sys.exit(2)

    # Try snapista first for proper InSAR coherence
    use_snapista = False
    try:
        import snapista
        use_snapista = True
    except ImportError:
        pass

    if use_snapista:
        try:
            result = compute_coherence_snap(before_path, after_path, output_path)
            print(json.dumps(result))
            sys.exit(0)
        except Exception as e:
            print(f"[sar_coherence] SNAP failed, falling back to pixel method: {e}",
                  file=sys.stderr)

    # Fallback: pixel-level intensity coherence estimation
    try:
        result = compute_coherence_pixel(before_path, after_path, output_path)
        print(json.dumps(result))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), file=sys.stderr)
        sys.exit(1)


def compute_coherence_snap(before_path, after_path, output_path):
    """Compute InSAR coherence using ESA SNAP via snapista."""
    import snapista

    # Create SNAP processing graph
    graph = snapista.Graph()

    # Read inputs
    read1 = graph.add_node(snapista.Operator("Read", file=before_path))
    read2 = graph.add_node(snapista.Operator("Read", file=after_path))

    # Coregistration
    coreg = graph.add_node(
        snapista.Operator("CreateStack",
                          masterBands="VV",
                          sourceBands="VV"),
        read1, read2
    )

    # Coherence estimation
    coherence = graph.add_node(
        snapista.Operator("Coherence",
                          cohWinAz=3,
                          cohWinRg=10),
        coreg
    )

    # Write output
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        tmp_path = tmp.name

    graph.add_node(
        snapista.Operator("Write",
                          file=tmp_path,
                          formatName="GeoTIFF"),
        coherence
    )

    # Execute
    graph.run()

    # Convert to colorized PNG
    from PIL import Image
    import numpy as np

    coh_img = Image.open(tmp_path)
    coh_np = np.array(coh_img).astype(np.float32)

    # Normalize to 0-1
    if coh_np.max() > 1:
        coh_np = coh_np / coh_np.max()

    # Colorize: high coherence (no change) = green, low coherence (change) = red
    h, w = coh_np.shape[:2]
    if len(coh_np.shape) > 2:
        coh_np = coh_np[:, :, 0]

    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    # Low coherence = high change = red
    change = 1.0 - coh_np
    mask = change > 0.3  # threshold for significant change

    rgba[mask, 0] = np.clip(change[mask] * 300, 0, 255).astype(np.uint8)  # R
    rgba[mask, 1] = np.clip((1 - change[mask]) * 150, 0, 255).astype(np.uint8)  # G
    rgba[mask, 2] = 0  # B
    rgba[mask, 3] = np.clip(change[mask] * 255, 100, 220).astype(np.uint8)  # A

    output_img = Image.fromarray(rgba)
    output_img.save(output_path, "PNG")

    # Cleanup
    os.unlink(tmp_path)

    change_percent = float(np.sum(mask)) / (h * w) * 100

    return {
        "status": "ok",
        "method": "coherence",
        "change_percent": round(change_percent, 1),
        "size": [w, h]
    }


def compute_coherence_pixel(before_path, after_path, output_path):
    """
    Simplified pixel-level coherence estimation.
    Uses local correlation coefficient as a proxy for InSAR coherence.
    """
    import numpy as np
    from PIL import Image

    before = np.array(Image.open(before_path).convert("L")).astype(np.float64)
    after = np.array(Image.open(after_path).convert("L")).astype(np.float64)

    # Ensure same dimensions
    h = min(before.shape[0], after.shape[0])
    w = min(before.shape[1], after.shape[1])
    before = before[:h, :w]
    after = after[:h, :w]

    # Local correlation in sliding windows (proxy for coherence)
    window = 7
    pad = window // 2

    coherence = np.zeros((h, w), dtype=np.float64)

    # Pad images
    before_pad = np.pad(before, pad, mode="reflect")
    after_pad = np.pad(after, pad, mode="reflect")

    for y in range(h):
        for x in range(w):
            b_patch = before_pad[y:y + window, x:x + window].flatten()
            a_patch = after_pad[y:y + window, x:x + window].flatten()

            b_std = np.std(b_patch)
            a_std = np.std(a_patch)

            if b_std < 1e-6 or a_std < 1e-6:
                coherence[y, x] = 0.0
            else:
                corr = np.corrcoef(b_patch, a_patch)[0, 1]
                coherence[y, x] = max(0, corr)

    # Colorize: low coherence (change) = red, transparent where no change
    change = 1.0 - coherence
    mask = change > 0.3

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[mask, 0] = np.clip(change[mask] * 300, 0, 255).astype(np.uint8)
    rgba[mask, 1] = np.clip((1 - change[mask]) * 150, 0, 255).astype(np.uint8)
    rgba[mask, 3] = np.clip(change[mask] * 255, 100, 220).astype(np.uint8)

    output_img = Image.fromarray(rgba)
    output_img.save(output_path, "PNG")

    change_percent = float(np.sum(mask)) / (h * w) * 100

    return {
        "status": "ok",
        "method": "pixel_coherence",
        "change_percent": round(change_percent, 1),
        "size": [w, h]
    }


if __name__ == "__main__":
    main()
