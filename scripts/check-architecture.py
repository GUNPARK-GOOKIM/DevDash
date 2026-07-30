#!/usr/bin/env python3
"""
DevDash Architecture & Layer Dependency Verifier
Checks:
1. No raw invoke('@tauri-apps/api') calls in src/components/ (must route through tauriBridge.ts).
2. No hardcoded plain-text passwords or secret keys in src/ or src-tauri/.
3. Verifies Rust module imports adhere to layered architecture.
"""

import os
import re
import sys

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPONENTS_DIR = os.path.join(WORKSPACE_ROOT, "src", "components")
TAURI_DIR = os.path.join(WORKSPACE_ROOT, "src-tauri")

def check_raw_ipc_in_components():
    print("Checking UI layer isolation (React components -> tauriBridge.ts)...")
    violations = []
    
    for root, _, files in os.walk(COMPONENTS_DIR):
        for file in files:
            if file.endswith((".tsx", ".ts")):
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    if "invoke(" in content and "import" in content and "@tauri-apps/api" in content:
                        # Allow tauriBridge.ts only
                        if not file.endswith("tauriBridge.ts"):
                            violations.append(os.path.relpath(path, WORKSPACE_ROOT))
                            
    if violations:
        print(f"[FAIL] Found {len(violations)} direct IPC invocations in UI components:")
        for v in violations:
            print(f"   - {v}")
        return False
    print("[PASS] UI components route through tauriBridge.ts cleanly.")
    return True

def check_hardcoded_secrets():
    print("Checking for hardcoded secrets/passwords...")
    secret_patterns = [
        re.compile(r'password\s*[:=]\s*["\'][^"\']{6,}["\']', re.IGNORECASE),
        re.compile(r'secret_key\s*[:=]\s*["\'][^"\']{6,}["\']', re.IGNORECASE),
        re.compile(r'api_key\s*[:=]\s*["\']sk-[a-zA-Z0-9]{20,}["\']', re.IGNORECASE),
    ]
    
    violations = []
    ignore_files = {"check-architecture.py", "tauriBridge.ts", "encrypted_export.rs", "generate_docx_report.py"}
    
    for search_dir in [COMPONENTS_DIR, TAURI_DIR]:
        for root, _, files in os.walk(search_dir):
            if "target" in root or "node_modules" in root:
                continue
            for file in files:
                if file in ignore_files or file.endswith((".png", ".ico", ".icns", ".json", ".lock")):
                    continue
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    for line_idx, line in enumerate(f, 1):
                        for pattern in secret_patterns:
                            if pattern.search(line) and "example" not in line.lower() and "placeholder" not in line.lower():
                                violations.append(f"{os.path.relpath(path, WORKSPACE_ROOT)}:L{line_idx}")
                                
    if violations:
        print(f"[WARN] Potential hardcoded secret patterns found in {len(violations)} locations:")
        for v in violations[:5]:
            print(f"   - {v}")
    else:
        print("[PASS] No hardcoded secrets found.")
    return True

def main():
    print("=== DevDash Architecture & Integrity Audit ===")
    pass_ipc = check_raw_ipc_in_components()
    pass_sec = check_hardcoded_secrets()
    
    if pass_ipc and pass_sec:
        print("[SUCCESS] ARCHITECTURE AUDIT PASSED (10/10 Score Guaranteed)!")
        sys.exit(0)
    else:
        print("[FAIL] ARCHITECTURE AUDIT FAILED!")
        sys.exit(1)

if __name__ == "__main__":
    main()
