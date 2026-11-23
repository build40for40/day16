# Seasoned recipe illustrations

This folder contains the close-cropped gouache lens, a reference crop, and the
Gemini batch runner. The runner uses Python 3 and the macOS `sips` utility.
The book build reads date-matched JPEGs from `pictures/seasoned/`.

Set `GEMINI_API_KEY` in the environment or the checkout's ignored `.env`.
Run from the repo root.

```sh
python3 pictures/generate.py plan
python3 pictures/generate.py submit
python3 pictures/generate.py collect
```

The pilot selects one dish per month and rotates meal types. Collection saves
successful images as `pictures/seasoned/MM-DD.jpg`. Run collection again if a
batch is still processing. Review the pilot in the A5 book before submitting the
remaining recipes.

```sh
python3 pictures/generate.py plan --all
python3 pictures/generate.py submit --all
python3 pictures/generate.py collect
npm run pages:book
```

The runner skips existing JPEGs and pending dates. Request files and Gemini
job IDs live in the ignored `pictures/.image-batches/` folder. If submission
times out after a job attempt is recorded, look for the matching display name
in Gemini before retrying. Keep the job records until the book is complete.
