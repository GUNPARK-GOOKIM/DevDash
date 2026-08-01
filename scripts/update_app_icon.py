import os
from PIL import Image

source_image = r"C:\Users\Lenovo\.gemini\antigravity-ide\brain\6644c887-c945-4b37-a944-0cedd25817a7\media__1785616806525.jpg"
devdash_root = r"e:\devdash"

img = Image.open(source_image).convert("RGBA")

# 1. Update public/logo.png
public_logo = os.path.join(devdash_root, "public", "logo.png")
img.resize((512, 512), Image.Resampling.LANCZOS).save(public_logo, "PNG")
print(f"[SUCCESS] Saved {public_logo}")

# 2. Update icons in src-tauri/icons/
icons_dir = os.path.join(devdash_root, "src-tauri", "icons")
os.makedirs(icons_dir, exist_ok=True)

targets = {
    "icon.png": (512, 512),
    "32x32.png": (32, 32),
    "128x128.png": (128, 128),
    "128x128@2x.png": (256, 256),
    "256x256.png": (256, 256),
}

for name, size in targets.items():
    path = os.path.join(icons_dir, name)
    img.resize(size, Image.Resampling.LANCZOS).save(path, "PNG")
    print(f"[SUCCESS] Saved {path}")

# 3. Save Windows ICO file icon.ico
ico_path = os.path.join(icons_dir, "icon.ico")
ico_img = img.resize((256, 256), Image.Resampling.LANCZOS)
ico_img.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(f"[SUCCESS] Saved {ico_path}")

print("[COMPLETE] All app logos and Tauri icons updated successfully!")
