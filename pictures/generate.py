#!/usr/bin/env python3
"""Generate Seasoned recipe pictures with the Gemini Batch API."""
import argparse
import base64
from datetime import date, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.request import Request, urlopen

PICTURES = Path(__file__).resolve().parent
ROOT = PICTURES.parent
RECIPES = ROOT / "recipes/out/book/recipes"
OUTPUT = PICTURES / "seasoned"
JOBS = PICTURES / ".image-batches"
API = "https://generativelanguage.googleapis.com"
MODEL = "gemini-nano-banana-2.1"


def api_key():
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        if os.environ.get(name):
            return os.environ[name]
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() in {"GEMINI_API_KEY", "GOOGLE_API_KEY"} and value.strip():
                return value.strip().strip("'\042")
    raise ValueError("Set GEMINI_API_KEY in the environment or the repo's .env.")


def request(url, *, data=None, headers=None):
    if not url.startswith(API + "/"):
        raise ValueError("Unexpected Gemini API URL")
    options = {"x-goog-api-key": api_key(), **(headers or {})}
    if isinstance(data, dict):
        options["Content-Type"] = "application/json"
        data = json.dumps(data).encode()
    try:
        with urlopen(Request(url, data=data, headers=options), timeout=180) as response:
            return response.read(), response.headers
    except HTTPError as error:
        raise ValueError(f"Gemini returned HTTP {error.code} for {url.split('?')[0]}") from None


def recipe_files():
    files = sorted(RECIPES.glob("*.json"))
    expected = [(date(2027, 1, 1) + timedelta(days=i)).strftime("%m-%d") for i in range(365)]
    if [path.stem for path in files] != expected:
        raise ValueError("Expected one recipe JSON for every date of the book.")
    return files


def pilot_files(files):
    # One per month, rotating meals wherever possible.
    meals = ("breakfast", "lunch", "dinner", "snack")
    selected = []
    for month in range(1, 13):
        candidates = [path for path in files if path.stem.startswith(f"{month:02d}-")]
        selected.append(next(
            (path for path in candidates
             if json.loads(path.read_bytes())["recipe"]["meal"] == meals[(month - 1) % 4]),
            candidates[0],
        ))
    return selected


def request_row(path, lens, reference):
    document = json.loads(path.read_bytes())
    recipe = document["recipe"]
    palette = ("cobalt blue", "deep plum", "pale turquoise", "olive green",
               "butter yellow", "warm ivory", "brick red", "dusty pink")
    vessel = palette[(document["slot"]["day"] - 1) % len(palette)]
    fields = {key: recipe[key] for key in ("title", "ingredients", "seasoning", "steps")}
    prompt = (
        f"{lens}\n\nFinished recipe:\n{json.dumps(fields, ensure_ascii=False)}\n"
        "Use the attached image for gouache brushwork, saturated colours and tight framing. "
        "Create exactly one landscape illustration of this finished dish. "
        "Use a 2:1 hero composition with the main food clearly visible in the central area. "
        "Show the cooked texture and keep the finished dish identifiable. "
        f"Where a serving vessel is visible, use {vessel} ceramic. "
        "Use the reference for technique only. Use the recipe's own ingredients and food colours."
    )
    return {
        "key": path.stem,
        "request": {
            "contents": [{"parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": "image/jpeg", "data": reference}},
            ]}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {"aspectRatio": "16:9", "imageSize": "2K"},
            },
        },
    }


def prepare(full):
    files = recipe_files()
    selected = files if full else pilot_files(files)
    pending = set()
    for record in JOBS.glob("*.job.json"):
        if not json.loads(record.read_text()).get("finished"):
            source = batch_input_for(record)
            pending.update(json.loads(line)["key"] for line in source.read_text().splitlines())
    missing = [
        path for path in selected
        if path.stem not in pending and not (OUTPUT / f"{path.stem}.jpg").is_file()
    ]
    print(f"{len(files)} recipes verified. {len(missing)} images pending in this selection.")
    if not missing:
        return []
    lens = (PICTURES / "gouache-lens.txt").read_text().split("Recipe input", 1)[0].strip()
    reference = base64.b64encode((PICTURES / "gouache-reference.jpg").read_bytes()).decode()
    JOBS.mkdir(parents=True, exist_ok=True)
    batches = []
    for start in range(0, len(missing), 60):
        group = missing[start:start + 60]
        rows = [request_row(path, lens, reference) for path in group]
        payload = "".join(json.dumps(row) + "\n" for row in rows).encode()
        digest = hashlib.sha256(payload).hexdigest()[:16]
        batch = JOBS / f"{'book' if full else 'pilot'}-{digest}.jsonl"
        batch.write_bytes(payload)
        batches.append(batch)
        print(f"{batch.name}: {', '.join(path.stem for path in group)}")
    return batches


def submit(batch, model):
    payload = batch.read_bytes()
    name = batch.stem
    record = batch.with_suffix(".job.json")
    if record.exists():
        print(f"{name}: previous submission recorded in {record.name}. "
              "Move the record aside to explicitly retry the same batch.")
        return
    _, headers = request(f"{API}/upload/v1beta/files", data={"file": {"display_name": name}}, headers={
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(len(payload)),
        "X-Goog-Upload-Header-Content-Type": "application/jsonl",
    })
    uploaded, _ = request(headers["X-Goog-Upload-URL"], data=payload, headers={
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
    })
    source = json.loads(uploaded)["file"]["name"]
    # Record the attempt before creating the job. A timeout can still create a job.
    with record.open("x") as handle:
        json.dump({"model": model, "source": source, "name": None}, handle)
    created, _ = request(f"{API}/v1beta/models/{model}:batchGenerateContent", data={
        "batch": {"display_name": name, "input_config": {"file_name": source}},
    })
    job = json.loads(created)
    record.write_text(json.dumps({"model": model, "source": source, "name": job["name"]}))
    print(f"{name}: submitted {job['name']}")


def save_image(row, key):
    candidates = row.get("response", {}).get("candidates", [])
    images = [
        part["inlineData"] for candidate in candidates
        for part in candidate.get("content", {}).get("parts", [])
        if part.get("inlineData", {}).get("mimeType", "").startswith("image/")
    ]
    if len(images) != 1:
        raise ValueError(f"expected one image, received {len(images)}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=OUTPUT) as temp:
        source = Path(temp) / "source"
        target = Path(temp) / "image.jpg"
        source.write_bytes(base64.b64decode(images[0]["data"], validate=True))
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "90", str(source), "--out", str(target)],
            check=True, capture_output=True,
        )
        # An existing recipe image is never overwritten.
        try:
            os.link(target, OUTPUT / f"{key}.jpg")
        except FileExistsError:
            pass


def batch_input_for(record):
    return record.with_name(record.name.removesuffix(".job.json") + ".jsonl")


def collect():
    for record in sorted(JOBS.glob("*.job.json")):
        saved = json.loads(record.read_text())
        if saved.get("finished"):
            continue
        name = saved["name"]
        if not name:
            print(f"{record.name}: submission uncertain. Check Gemini jobs before retrying.")
            continue
        result, _ = request(f"{API}/v1beta/{name}")
        job = json.loads(result)
        metadata = job.get("metadata", job)
        state = metadata.get("state", job.get("state"))
        print(f"{name}: {state}")
        if state in {"JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED",
                     "BATCH_STATE_FAILED", "BATCH_STATE_CANCELLED", "BATCH_STATE_EXPIRED"}:
            record.write_text(json.dumps({**saved, "finished": state}))
        if state not in {"JOB_STATE_SUCCEEDED", "BATCH_STATE_SUCCEEDED"}:
            continue
        dest = metadata.get("dest") or job.get("dest") or job.get("response", {})
        output_file = dest.get("fileName") or dest.get("responsesFile")
        if not output_file or not re.fullmatch(r"files/[\w-]+", output_file):
            raise ValueError(f"{name}: could not identify the result file")
        source = batch_input_for(record)
        keys = {json.loads(line)["key"] for line in source.read_text().splitlines()}
        results, _ = request(f"{API}/download/v1beta/{output_file}:download?alt=media")
        for line in results.splitlines():
            row = json.loads(line)
            key = row.get("key")
            if key not in keys or (OUTPUT / f"{key}.jpg").exists():
                continue
            try:
                save_image(row, key)
            except (ValueError, KeyError, subprocess.CalledProcessError) as error:
                print(f"{key}: image not saved ({type(error).__name__})")
        record.write_text(json.dumps({**saved, "finished": state}))
        missing = sorted(key for key in keys if not (OUTPUT / f"{key}.jpg").exists())
        print(f"{len(keys) - len(missing)}/{len(keys)} saved. Missing: {', '.join(missing) or 'none'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "submit", "collect"))
    parser.add_argument("--all", action="store_true", help="Select the whole book instead of the pilot.")
    parser.add_argument("--model", default=MODEL)
    args = parser.parse_args()
    if args.command == "collect":
        collect()
    else:
        if args.command == "submit":
            api_key()
        for batch in prepare(args.all):
            if args.command == "submit":
                submit(batch, args.model)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        sys.exit(str(error))
