import os
import zipfile
import requests
import threading
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Try Supabase client ──────────────────────────────────────────────────────
try:
    from supabase import create_client, Client
    USE_SUPABASE_CLIENT = True
except ImportError:
    USE_SUPABASE_CLIENT = False
    print("  supabase-py not installed. Falling back to REST API.")
    print("    Install: pip install supabase\n")


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                           CONFIG                                      ║
# ╚══════════════════════════════════════════════════════════════════════════╝
SUPABASE_URL    = "https://fzoncqqwztcsqajjesrq.supabase.co"
SUPABASE_KEY    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6b25jcXF3enRjc3Fhamplc3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTMwNzAsImV4cCI6MjA5MDI2OTA3MH0.xfiXna3jPtTS5y6KkllT2_6CMuFGZA6qvX04JZLio8I"
BUCKET_NAME     = "Videos"
FOLDER_PATH     = "uploads"     # subfolder inside bucket, "" = root
OUTPUT_ZIP      = f"supabase_videos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"

PAGE_SIZE       = 1000          # max per API call (Supabase limit)
MAX_WORKERS     = 10            # parallel download threads (increase for faster speed)

# Supported video extensions
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v", ".mpeg", ".mpg"}


# ════════════════════════════════════════════════════════════════════════════
#  Helpers
# ════════════════════════════════════════════════════════════════════════════

def is_video(filename: str) -> bool:
    return Path(filename).suffix.lower() in VIDEO_EXTENSIONS


# ── Paginated file listing (handles > 1000 files) ───────────────────────────
def list_all_files_paginated(bucket: str, folder: str = "") -> list[dict]:
    """
    Fetches ALL files by looping with offset until no more results.
    Supabase returns max 1000 per call, so we paginate automatically.
    """
    all_files = []
    offset    = 0

    print(f" Fetching file list (paginated, {PAGE_SIZE}/page)...")

    while True:
        url     = f"{SUPABASE_URL}/storage/v1/object/list/{bucket}"
        headers = {
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
        }
        payload = {
            "prefix":  folder,
            "limit":   PAGE_SIZE,
            "offset":  offset,
            "sortBy":  {"column": "name", "order": "asc"},
        }

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        page = response.json()

        if not page:
            break  # no more files

        all_files.extend(page)
        print(f"    Page fetched: {len(page)} files  (total so far: {len(all_files)})")

        if len(page) < PAGE_SIZE:
            break  # last page (partial)

        offset += PAGE_SIZE  # next page

    return all_files


# ── Single file download ─────────────────────────────────────────────────────
def download_file(bucket: str, file_path: str) -> bytes:
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{file_path}"
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.content


# ════════════════════════════════════════════════════════════════════════════
#  Core: Parallel Download + ZIP
# ════════════════════════════════════════════════════════════════════════════

def run_download():
    print(f"\n Supabase: {SUPABASE_URL}")
    print(f"   Bucket  : {BUCKET_NAME}")
    print(f"   Folder  : {FOLDER_PATH or 'root'}")
    print(f"   Threads : {MAX_WORKERS} parallel downloads\n")

    # ── Step 1: List ALL files with pagination ───────────────────────────────
    try:
        all_files = list_all_files_paginated(BUCKET_NAME, FOLDER_PATH)
    except requests.HTTPError as e:
        print(f"\nFailed to list files: {e}")
        return

    # ── Step 2: Filter videos only ───────────────────────────────────────────
    video_files = [
        f for f in all_files
        if f.get("name") and is_video(f["name"])
    ]

    total = len(video_files)
    if total == 0:
        print("\n No video files found in the bucket/folder.")
        return

    print(f"\n Total videos found: {total}")
    print(f" Downloading all {total} videos in parallel ({MAX_WORKERS} threads)...\n")

    # ── Step 3: Parallel download ─────────────────────────────────────────────
    # results dict: { filename: bytes or Exception }
    results     = {}
    lock        = threading.Lock()
    completed   = [0]  # mutable counter for thread-safe progress

    def fetch(file_info: dict):
        name      = file_info["name"]
        file_path = f"{FOLDER_PATH}/{name}".lstrip("/")
        try:
            data = download_file(BUCKET_NAME, file_path)
            with lock:
                completed[0] += 1
                print(f"   [{completed[0]}/{total}] {name}  ({len(data)/1024:.1f} KB)")
            return name, data
        except Exception as e:
            with lock:
                completed[0] += 1
                print(f"   [{completed[0]}/{total}] {name}  ERROR: {e}")
            return name, e

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(fetch, f): f for f in video_files}
        for future in as_completed(futures):
            name, result = future.result()
            results[name] = result

    # ── Step 4: Write ZIP ─────────────────────────────────────────────────────
    print(f"\n Writing ZIP file: {OUTPUT_ZIP} ...")

    success_count = 0
    fail_count    = 0

    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in results.items():
            if isinstance(data, Exception):
                fail_count += 1
            else:
                zf.writestr(name, data)
                success_count += 1

    # ── Step 5: Summary ───────────────────────────────────────────────────────
    size_mb = os.path.getsize(OUTPUT_ZIP) / (1024 * 1024)
    print(f"\n{'='*55}")
    print(f" Done!")
    print(f"   Downloaded : {success_count} video(s)")
    if fail_count:
        print(f"    Failed     : {fail_count} video(s)")
    print(f"  ZIP file   : {OUTPUT_ZIP}  ({size_mb:.2f} MB)")
    print(f"{'='*55}")


# ════════════════════════════════════════════════════════════════════════════
#  Entry Point
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    run_download()