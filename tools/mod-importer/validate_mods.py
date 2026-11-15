#!/usr/bin/env python3
"""Validador de mods convertidos para Funkade. Sin dependencias externas."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

def load_json(path):
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mods", default="public/mods")
    ap.add_argument("--markdown", default="mod-validation.md")
    ap.add_argument("--json", dest="json_out", default="mod-validation.json")
    args = ap.parse_args()
    root = Path(args.mods)
    report = {"checkedMods": 0, "errors": [], "warnings": [], "mods": []}
    if not root.is_dir():
        report["errors"].append(f"No existe la carpeta {root}")
    else:
        for folder in sorted(p for p in root.iterdir() if p.is_dir()):
            manifest_path = folder / "manifest.json"
            if not manifest_path.is_file():
                report["errors"].append(f"{folder.name}: falta manifest.json")
                continue
            try:
                manifest = load_json(manifest_path)
            except Exception as exc:
                report["errors"].append(f"{folder.name}/manifest.json: JSON inválido: {exc}")
                continue
            report["checkedMods"] += 1
            item = {"id": manifest.get("id", folder.name), "name": manifest.get("name", folder.name),
                    "format": manifest.get("format", "desconocido"), "files": 0, "jsonFiles": 0,
                    "errors": [], "warnings": []}
            listed = manifest.get("files")
            if not isinstance(listed, list):
                item["errors"].append("manifest.files no es una lista")
                listed = []
            actual = {}
            for p in folder.rglob("*"):
                if p.is_file() and p.name != "manifest.json":
                    actual[p.relative_to(folder).as_posix().lower()] = p
            item["files"] = len(actual)
            for rel in listed:
                if not isinstance(rel, str):
                    item["errors"].append("manifest.files contiene una ruta que no es texto")
                    continue
                clean = rel.replace("\\", "/").lstrip("./")
                if ".." in Path(clean).parts or clean.startswith("/"):
                    item["errors"].append(f"Ruta insegura en manifest.files: {rel}")
                    continue
                if clean.lower() not in actual:
                    item["errors"].append(f"Archivo listado que no existe: {rel}")
            listed_set = {str(x).replace("\\", "/").lower() for x in listed if isinstance(x, str)}
            for rel, path in actual.items():
                if path.suffix.lower() != ".json":
                    continue
                item["jsonFiles"] += 1
                try:
                    load_json(path)
                except Exception as exc:
                    item["errors"].append(f"{rel}: JSON inválido ({exc})")
            for key in ("id", "name", "format", "songs"):
                if key not in manifest:
                    item["errors"].append(f"manifest.json: falta el campo obligatorio '{key}'")
            if manifest.get("format") not in ("psych", "vslice", "fnfweb"):
                item["warnings"].append(f"Formato no reconocido: {manifest.get('format')}")
            cover = manifest.get("cover")
            if cover and str(cover).replace("\\", "/").lower() not in actual:
                item["warnings"].append(f"No se encuentra la portada: {cover}")
            songs = manifest.get("songs") if isinstance(manifest.get("songs"), list) else []
            if not songs:
                item["warnings"].append("El manifiesto no declara canciones.")
            if manifest.get("format") == "psych":
                for song in songs:
                    if not isinstance(song, dict) or not song.get("id"):
                        item["warnings"].append("Entrada de canción incompleta en manifest.songs")
                        continue
                    sid = str(song["id"]).lower()
                    diffs = song.get("difficulties") or ["normal"]
                    for diff in diffs:
                        diff = str(diff).lower()
                        candidates = [f"data/{sid}/{sid}-{diff}.json", f"data/{sid}/{sid}.json"]
                        if not any(c in listed_set for c in candidates):
                            item["warnings"].append(f"{sid}: no aparece chart para dificultad '{diff}' (buscado: {candidates[0]})")
            for rel, path in actual.items():
                if not rel.startswith("characters/") or not rel.endswith(".json"):
                    continue
                try:
                    char = load_json(path)
                except Exception:
                    continue
                image = char.get("image") if isinstance(char, dict) else None
                if isinstance(image, str) and image:
                    base = image.replace("\\", "/").lower()
                    if not base.startswith("images/"):
                        base = "images/" + base
                    if base.endswith(".png"):
                        base = base[:-4]
                    if base + ".png" not in actual:
                        item["warnings"].append(f"{rel}: atlas PNG no encontrado para image='{image}'")
            report["errors"].extend(f"{item['id']}: {e}" for e in item["errors"])
            report["warnings"].extend(f"{item['id']}: {w}" for w in item["warnings"])
            report["mods"].append(item)
    md = ["# Validación automática de mods Funkade", "",
          f"- Mods revisados: **{report['checkedMods']}**",
          f"- Errores: **{len(report['errors'])}**",
          f"- Avisos: **{len(report['warnings'])}**", ""]
    for mod in report["mods"]:
        status = "ERROR" if mod["errors"] else ("AVISOS" if mod["warnings"] else "OK")
        md.append(f"## {status} - {mod['name']} ({mod['id']})")
        md.append(f"- Formato: {mod['format']} · Archivos: {mod['files']} · JSON: {mod['jsonFiles']}")
        for e in mod["errors"]:
            md.append(f"- ERROR: {e}")
        for w in mod["warnings"]:
            md.append(f"- AVISO: {w}")
        if not mod["errors"] and not mod["warnings"]:
            md.append("- Estructura y JSON correctos")
        md.append("")
    if report["errors"]:
        md += ["## Errores globales"] + [f"- ERROR: {x}" for x in report["errors"]]
    if report["warnings"]:
        md += ["## Avisos globales"] + [f"- AVISO: {x}" for x in report["warnings"]]
    Path(args.markdown).write_text("\n".join(md), encoding="utf-8")
    Path(args.json_out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n".join(md))
    return 1 if report["errors"] else 0

if __name__ == "__main__":
    sys.exit(main())
