#!/usr/bin/env python3
"""Add contextSize field to every model and submodel in ai-models.geojson.

Values are in tokens. Use "undisclosed" when not publicly known.
"""
import json
from pathlib import Path
from collections import OrderedDict

DATA = Path(__file__).resolve().parent.parent / "backend" / "data" / "ai-models.json"

# Top-level model context sizes (by id). Submodel-specific overrides below.
MODEL_CTX = {
    "subq1m-preview": "1M",
    "granite-41": "128K",
    "sonar-2": "200K",
    "gemini-31": "1M",
    "gemini-30": "1M",
    "kimi-k26": "256K",
    "kimi-k25": "256K",
    "kimi-linear": "1M",
    "kimi-v2": "128K",
    "kimi-dev": "128K",
    "kimi-vl": "128K",
    "kimi-v15": "128K",
    "mimo-v2": "undisclosed",
    "mimo": "32K",
    "mimo-v25": "undisclosed",
    "minerva": "16K",
    "amalia": "undisclosed",
    "deepseek-v4": "128K",
    "claude-4-haiku": "200K",
    "claude-4-sonnet": "200K",
    "claude-3-haiku": "200K",
    "claude-instant": "100K",
    "gpt-oss": "128K",
    "openai-o4-mini": "200K",
    "gpt-35": "16K",
    "gpt-54": "400K",
    "gpt-53-codex": "400K",
    "gpt-52": "400K",
    "gpt-51": "400K",
    "gpt-55": "400K",
    "qwen-36": "256K",
    "glm-47-flash": "128K",
    "glm-47": "200K",
    "xlnet": "512",
    "t5": "512",
    "bert": "512",
    "gpt-1": "512",
    "gpt-4o": "128K",
    "claude-opus-4": "200K",
    "gemini-2": "1M",
    "llama-3": "128K",
    "mistral-large": "128K",
    "qwen-3": "128K",
    "deepseek-r1": "128K",
    "ernie-4": "128K",
    "yi-large": "32K",
    "falcon-180b": "8K",
    "command-r": "128K",
    "jamba": "256K",
    "stable-diffusion-3": "N/A",
    "grok-3": "1M",
    "phi-4": "16K",
    "luminous": "8K",
    "sarvam-1": "8K",
    "krutrim": "undisclosed",
    "hyperclova-x": "128K",
    "sakana-evo": "4K",
    "maritaca": "undisclosed",
    "lelapa": "2K",
    "gpt-2": "1K",
    "gpt-3": "2K",
    "gpt-neo": "2K",
    "gpt-j": "2K",
    "megatron-turing-nlg": "2K",
    "ernie-3-titan": "2K",
    "glam": "2K",
    "gopher": "2K",
    "lamda": "undisclosed",
    "chinchilla": "2K",
    "palm": "2K",
    "opt": "2K",
    "yalm": "2K",
    "bloom": "2K",
    "galactica": "2K",
    "alexatm": "1K",
    "gpt-neox": "2K",
    "llama-1": "2K",
    "gpt-4": "32K",
    "cerebras-gpt": "2K",
    "bloomberggpt": "2K",
    "pangu-sigma": "undisclosed",
    "palm-2": "8K",
    "llama-2": "4K",
    "claude-2": "100K",
    "mistral-7b": "32K",
    "grok-1": "8K",
    "gemini-1": "32K",
    "mixtral-8x7b": "32K",
    "deepseek-llm": "4K",
    "phi-2": "2K",
    "ibm-granite": "8K",
    "yandexgpt": "8K",
    "gemini-1-5": "1M",
    "gemma": "8K",
    "olmo": "4K",
    "claude-3": "200K",
    "dbrx": "32K",
    "phi-3": "128K",
    "qwen-2": "128K",
    "deepseek-v2": "128K",
    "nemotron-4": "4K",
    "claude-3-5": "200K",
    "llama-3-1": "128K",
    "grok-2": "128K",
    "openai-o1": "200K",
    "deepseek-v3": "128K",
    "amazon-nova": "300K",
    "pixtral": "128K",
    "olmo-2": "4K",
    "fugaku-llm": "2K",
    "qwen-2-5": "128K",
    "minimax-text-01": "4M",
    "gemini-2-0": "1M",
    "claude-3-7": "200K",
    "gpt-4-5": "128K",
    "llama-4": "10M",
    "openai-o3": "200K",
    "glm-4-5": "128K",
    "gpt-5": "400K",
    "sarvam-m": "32K",
    "param-1": "8K",
    "apertus": "65K",
}

# Per-submodel overrides keyed by (model_id, submodel_name).
SUBMODEL_CTX = {
    ("gpt-4o", "mini"): "128K",
    ("claude-opus-4", "4.1"): "200K",
    ("claude-opus-4", "4.5"): "200K",
    ("claude-opus-4", "4.6"): "200K",
    ("claude-opus-4", "4.7"): "200K",
    ("gemini-2", "Pro"): "1M",
    ("gemini-2", "Flash"): "1M",
    ("gemini-2", "Flash-lite"): "1M",
    ("gemini-2", "Flash image"): "32K",
    ("gemini-1", "Nano"): "32K",
    ("gemini-1", "Pro"): "32K",
    ("gemini-1", "Ultra"): "32K",
    ("gemini-1-5", "Nano"): "1M",
    ("gemini-1-5", "Pro"): "2M",
    ("gemini-1-5", "Ultra"): "1M",
    ("gemini-2-0", "Pro"): "2M",
    ("gemini-2-0", "Flash"): "1M",
    ("gemini-2-0", "Flash-lite"): "1M",
    ("llama-2", "llama2:7b"): "4K",
    ("llama-2", "llama2:13b"): "4K",
    ("llama-2", "llama2:70b"): "4K",
    ("claude-2", "2.1"): "200K",
    ("claude-instant", "1.1"): "100K",
    ("claude-instant", "1.2"): "100K",
    ("openai-o3", "mini"): "200K",
    ("openai-o3", "pro"): "200K",
}


def ctx_for_model(mid: str) -> str:
    return MODEL_CTX.get(mid, "undisclosed")


def ctx_for_submodel(mid: str, sub_name: str, parent_ctx: str) -> str:
    return SUBMODEL_CTX.get((mid, sub_name), parent_ctx)


def insert_after(d: dict, after_key: str, new_key: str, new_val) -> "OrderedDict":
    out = OrderedDict()
    inserted = False
    for k, v in d.items():
        out[k] = v
        if k == after_key:
            out[new_key] = new_val
            inserted = True
    if not inserted:
        out[new_key] = new_val
    return out


def main() -> None:
    raw = DATA.read_text()
    data = json.loads(raw, object_pairs_hook=OrderedDict)

    models = data["models"]
    updated = 0
    for model in models:
        mid = model["id"]
        parent_ctx = ctx_for_model(mid)
        new_model = insert_after(model, "parameters", "contextSize", parent_ctx)
        if "submodels" in new_model and isinstance(new_model["submodels"], list):
            new_subs = []
            for sub in new_model["submodels"]:
                sub_ctx = ctx_for_submodel(mid, sub.get("name", ""), parent_ctx)
                new_sub = insert_after(sub, "parameters", "contextSize", sub_ctx)
                new_subs.append(new_sub)
            new_model["submodels"] = new_subs
        models[updated] = new_model
        updated += 1

    data["models"] = models
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"Updated {updated} models.")


if __name__ == "__main__":
    main()
