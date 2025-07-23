import sys
import json
import numpy as np
import os
from pathlib import Path

try:
    from sentence_transformers import SentenceTransformer
    from sklearn.ensemble import RandomForestRegressor
    import ruptures as rpt
    import joblib
except ImportError as e:
    print(json.dumps({"error": f"Missing required package: {e}"}))
    sys.exit(1)

# Paths: script is in backend/scripts/, model is in backend/models/
script_dir = Path(__file__).parent
model_path = script_dir.parent / "models" / "random_forest_model.pkl"

if model_path.exists():
    reg = joblib.load(str(model_path))
else:
    reg = RandomForestRegressor(n_estimators=10, random_state=42)
    reg.fit(np.random.rand(100, 5), np.random.rand(100) * 100)

avg_speech_len = 40

try:
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
except Exception as e:
    print(json.dumps({"error": f"Failed to load embedder: {e}"}))
    sys.exit(1)

def extract_features(embeddings):
    try:
        novelties = []
        for i in range(1, len(embeddings)):
            sim = np.dot(embeddings[i], embeddings[i-1]) / (
                np.linalg.norm(embeddings[i]) * np.linalg.norm(embeddings[i-1]) + 1e-10
            )
            novelties.append(1 - sim)

        mean_novelty = np.mean(novelties) if novelties else 0
        var_novelty = np.var(novelties) if novelties else 0

        num_cps, last_cp = 0, 0
        if len(embeddings) >= 3:
            try:
                series = np.vstack(embeddings)
                model_cp = rpt.Pelt(model="rbf").fit(series)
                change_points = model_cp.predict(pen=6)
                num_cps = len(change_points) - 1
                last_cp = change_points[-2] if len(change_points) > 1 else 0
            except Exception:
                pass

        return mean_novelty, var_novelty, num_cps, last_cp
    except Exception:
        return 0, 0, 0, 0

def predict_progress(text):
    try:
        chunks = [c.strip() for c in text.strip().split(".") if c.strip()]
        if len(chunks) < 2:
            return 15.0

        embeddings = embedder.encode(chunks)
        mean_novelty, var_novelty, num_cps, last_cp = extract_features(embeddings)

        i = len(chunks)
        features = [
            i / avg_speech_len,
            mean_novelty,
            var_novelty,
            num_cps,
            last_cp / avg_speech_len
        ]

        pred = reg.predict([features])[0]
        return float(round(min(max(pred, 0), 100), 2))
    except Exception:
        words = text.split()
        return 25.0 if len(words) < 50 else 50.0 if len(words) < 100 else 75.0

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        data = json.loads(input_data)
        text = data.get("transcript", "")
        if not text.strip():
            print(json.dumps({"error": "Empty transcript provided"}))
            sys.exit(1)

        result = predict_progress(text)
        print(json.dumps({"prediction": result}))

    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Unexpected error: {e}"}))
        sys.exit(1)
