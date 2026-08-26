from __future__ import annotations

import csv
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from categorical import detect_categories
from models import EarthStoriesConversionProtocolV1

PROTOCOL = "earth-stories/conversion/v1"
VERSION_TIMEOUT_SECONDS = 60
TOOL_TIMEOUT_SECONDS = 900


class ToolTimeoutError(RuntimeError):
    pass


def capture_tool(
    command: list[str], *, check: bool = False, timeout: int = TOOL_TIMEOUT_SECONDS
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            check=check,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as error:
        raise ToolTimeoutError(f"Timed out running {command[0]}") from error


def emit(value: dict[str, Any]) -> None:
    print(json.dumps(value, separators=(",", ":")), flush=True)


def tool_version(command: list[str]) -> str:
    result = capture_tool(command, check=True, timeout=VERSION_TIMEOUT_SECONDS)
    lines = [
        line.strip()
        for line in (result.stdout or result.stderr).splitlines()
        if line.strip() and set(line.strip()) != {"-"}
    ]
    return lines[0] if lines else "unknown"


def run_tool(command: list[str]) -> None:
    result = capture_tool(command)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(detail or f"Tool exited with status {result.returncode}")


def inspect_csv(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        sample = source.read(65536)
        dialect = csv.Sniffer().sniff(sample)
        source.seek(0)
        reader = csv.DictReader(source, dialect=dialect)
        columns = reader.fieldnames or []
        preview = []
        count = 0
        for row in reader:
            count += 1
            if len(preview) < 5:
                preview.append(row)
    names = {name.lower(): name for name in columns}
    longitude = next(
        (names[name] for name in ("longitude", "lon", "lng", "x") if name in names),
        None,
    )
    latitude = next(
        (names[name] for name in ("latitude", "lat", "y") if name in names),
        None,
    )
    return {
        "format": "csv",
        "columns": columns,
        "featureCount": count,
        "preview": preview,
        "suggestedLongitudeColumn": longitude,
        "suggestedLatitudeColumn": latitude,
        "questions": []
        if longitude and latitude
        else ["Choose the longitude and latitude columns."],
    }


def inspect_gdal(path: Path) -> tuple[dict[str, Any], list[dict[str, str]]]:
    result = capture_tool(["gdalinfo", "-json", str(path)])
    if result.returncode == 0:
        info = json.loads(result.stdout)
        return (
            {
                "format": "raster",
                "driver": info.get("driverShortName"),
                "size": info.get("size"),
                "bands": [
                    {
                        "band": band.get("band"),
                        "type": band.get("type"),
                        "description": band.get("description", ""),
                    }
                    for band in info.get("bands", [])
                ],
                "coordinateSystem": info.get("coordinateSystem"),
                "metadata": info.get("metadata", {}),
            },
            [{"name": "GDAL", "version": tool_version(["gdalinfo", "--version"])}],
        )
    vector = capture_tool(
        ["ogrinfo", "-ro", "-so", "-al", "-json", str(path)],
        check=True,
    )
    info = json.loads(vector.stdout)
    return (
        {
            "format": "vector",
            "driver": info.get("driverShortName"),
            "layers": info.get("layers", []),
        },
        [{"name": "GDAL", "version": tool_version(["ogrinfo", "--version"])}],
    )


def inspect_multidim(path: Path) -> tuple[dict[str, Any], list[dict[str, str]]]:
    import xarray as xr

    dataset = xr.open_dataset(path, decode_times=False)
    try:
        output = {
            "format": "multidim",
            "dimensions": dict(dataset.sizes),
            "variables": [
                {
                    "name": name,
                    "dimensions": list(variable.dims),
                    "shape": list(variable.shape),
                    "dtype": str(variable.dtype),
                    "attributes": dict(variable.attrs),
                }
                for name, variable in dataset.data_vars.items()
            ],
            "attributes": dict(dataset.attrs),
        }
    finally:
        dataset.close()
    return output, [{"name": "xarray", "version": xr.__version__}]


def prepare_multidim(
    path: Path, output: Path, options: dict[str, Any]
) -> list[dict[str, str]]:
    import numpy as np
    import rasterio
    import xarray as xr
    from rasterio.transform import from_origin

    variable_name = options.get("variable")
    if not isinstance(variable_name, str) or not variable_name:
        raise ValueError("Choose a NetCDF/HDF5 variable to prepare")
    selections = options.get("selection", {})
    if not isinstance(selections, dict):
        raise ValueError("Multidimensional selections must be an object")

    dataset = xr.open_dataset(path, decode_times=False)
    temporary = output.with_suffix(".source.tif")
    try:
        if variable_name not in dataset.data_vars:
            raise ValueError(f'Variable "{variable_name}" was not found')
        data = dataset[variable_name]
        dimension_names = list(data.dims)
        x_dimension = next(
            (
                name
                for name in reversed(dimension_names)
                if name.lower() in ("x", "lon", "longitude", "easting")
            ),
            dimension_names[-1] if dimension_names else None,
        )
        y_dimension = next(
            (
                name
                for name in reversed(dimension_names)
                if name.lower() in ("y", "lat", "latitude", "northing")
            ),
            dimension_names[-2] if len(dimension_names) >= 2 else None,
        )
        if not x_dimension or not y_dimension or x_dimension == y_dimension:
            raise ValueError(
                "The selected variable does not have two spatial dimensions"
            )
        indexes = {
            dimension: int(selections.get(dimension, 0))
            for dimension in dimension_names
            if dimension not in (x_dimension, y_dimension)
        }
        for dimension, index in indexes.items():
            if index < 0 or index >= data.sizes[dimension]:
                raise ValueError(f"Selection {index} is outside dimension {dimension}")
        data = data.isel(indexes).squeeze(drop=True).transpose(y_dimension, x_dimension)
        values = np.asarray(data.values)
        if values.ndim != 2:
            raise ValueError("The selected slice is not two-dimensional")

        x_coordinates = np.asarray(data.coords[x_dimension].values, dtype="float64")
        y_coordinates = np.asarray(data.coords[y_dimension].values, dtype="float64")
        if x_coordinates.ndim != 1 or y_coordinates.ndim != 1:
            raise ValueError("Curvilinear coordinate grids are not supported in v1")
        if x_coordinates.size < 2 or y_coordinates.size < 2:
            raise ValueError("Spatial dimensions must contain at least two coordinates")
        x_resolution = float(np.median(np.diff(x_coordinates)))
        y_resolution = float(np.median(np.diff(y_coordinates)))
        if x_resolution == 0 or y_resolution == 0:
            raise ValueError("Spatial coordinates must have a regular non-zero spacing")
        if y_resolution > 0:
            values = np.flipud(values)
            y_coordinates = y_coordinates[::-1]
            y_resolution = -y_resolution
        transform = from_origin(
            float(x_coordinates.min() - abs(x_resolution) / 2),
            float(y_coordinates.max() + abs(y_resolution) / 2),
            abs(x_resolution),
            abs(y_resolution),
        )
        crs = str(options.get("crs") or data.attrs.get("crs") or "EPSG:4326")
        nodata = data.attrs.get("_FillValue", data.attrs.get("missing_value"))
        with rasterio.open(
            temporary,
            "w",
            driver="GTiff",
            width=values.shape[1],
            height=values.shape[0],
            count=1,
            dtype=values.dtype,
            crs=crs,
            transform=transform,
            nodata=nodata,
        ) as destination:
            destination.write(values, 1)
            destination.set_band_description(1, variable_name)
        run_tool(["rio", "cogeo", "create", str(temporary), str(output), "--quiet"])
        run_tool(["rio", "cogeo", "validate", str(output)])
    finally:
        dataset.close()
        temporary.unlink(missing_ok=True)
    return [
        {"name": "xarray", "version": xr.__version__},
        {"name": "rasterio", "version": rasterio.__version__},
        {"name": "rio-cogeo", "version": tool_version(["rio", "cogeo", "--version"])},
    ]


def prepare_raster(
    path: Path, output: Path
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    run_tool(["rio", "cogeo", "create", str(path), str(output), "--quiet"])
    run_tool(["rio", "cogeo", "validate", str(output)])
    try:
        categories = detect_categories(output)
    except Exception:
        categories = []
    return (
        [{"name": "rio-cogeo", "version": tool_version(["rio", "cogeo", "--version"])}],
        categories,
    )


def prepare_vector(
    path: Path, output: Path, options: dict[str, Any]
) -> tuple[list[dict[str, str]], list[str]]:
    target = str(options.get("target", "geoparquet"))
    warnings: list[str] = []
    if target == "trajectory":
        from osgeo import ogr

        ogr.UseExceptions()
        dataset = ogr.Open(str(path), 0)
        if dataset is None:
            raise ValueError("GDAL could not open this GPX file")
        layer = dataset.GetLayerByName("track_points")
        if layer is None:
            raise ValueError("The GPX file does not contain track points")
        tracks: dict[str, dict[str, list[Any]]] = {}
        for feature in layer:
            geometry = feature.GetGeometryRef()
            if geometry is None:
                continue
            track_id = str(feature.GetField("track_fid") or "track-1")
            segment_id = str(feature.GetField("track_seg_id") or "segment-1")
            key = f"{track_id}:{segment_id}"
            track = tracks.setdefault(key, {"path": [], "timestamps": []})
            track["path"].append([geometry.GetX(), geometry.GetY()])
            timestamp = feature.GetField("time")
            if timestamp:
                normalized = str(timestamp).replace("/", "-").replace("Z", "+00:00")
                if normalized.endswith(("+00", "-00")):
                    normalized = f"{normalized}:00"
                parsed = datetime.fromisoformat(normalized)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                track["timestamps"].append(parsed.timestamp())
            else:
                track["timestamps"].append(float(len(track["path"]) - 1))
        prepared_tracks = [
            track for track in tracks.values() if len(track["path"]) >= 2
        ]
        if not prepared_tracks:
            raise ValueError("The GPX file has no track with at least two points")
        output.write_text(json.dumps({"tracks": prepared_tracks}), encoding="utf-8")
        return (
            [{"name": "GDAL", "version": tool_version(["ogrinfo", "--version"])}],
            warnings,
        )
    if target == "pmtiles":
        command = ["ogr2ogr", "-f", "PMTiles", str(output), str(path)]
        run_tool(command)
        return (
            [{"name": "GDAL", "version": tool_version(["ogr2ogr", "--version"])}],
            warnings,
        )

    if path.suffix.lower() in (".csv", ".geojson", ".json"):
        try:
            import duckdb

            connection = duckdb.connect()
            try:
                runtime_directory = options.get("runtimeDirectory")
                extension_directory = (
                    Path(str(runtime_directory)) / "duckdb-extensions"
                    if runtime_directory
                    else output.parent / ".duckdb-extensions"
                )
                extension_directory.mkdir(parents=True, exist_ok=True)
                extension_path = str(extension_directory).replace("'", "''")
                connection.execute(f"SET extension_directory = '{extension_path}'")
                try:
                    connection.execute("LOAD spatial")
                except duckdb.IOException:
                    connection.execute("INSTALL spatial")
                    connection.execute("LOAD spatial")
                if path.suffix.lower() == ".csv":
                    longitude = options.get("longitudeColumn")
                    latitude = options.get("latitudeColumn")
                    if not longitude or not latitude:
                        raise ValueError(
                            "Choose longitude and latitude columns before preparing this CSV."
                        )
                    longitude_name = str(longitude).replace('"', '""')
                    latitude_name = str(latitude).replace('"', '""')
                    connection.execute(
                        f'''CREATE TEMP TABLE prepared AS
                            SELECT *, ST_Point(
                              TRY_CAST("{longitude_name}" AS DOUBLE),
                              TRY_CAST("{latitude_name}" AS DOUBLE)
                            ) AS geometry
                            FROM read_csv_auto(?)''',
                        [str(path)],
                    )
                else:
                    connection.execute(
                        "CREATE TEMP TABLE prepared AS SELECT * FROM ST_Read(?)",
                        [str(path)],
                    )
                connection.table("prepared").write_parquet(
                    str(output), compression="zstd"
                )
            finally:
                connection.close()
            return (
                [{"name": "DuckDB Spatial", "version": duckdb.__version__}],
                warnings,
            )
        except ValueError:
            raise
        except Exception as error:
            warnings.append(
                f"DuckDB Spatial could not prepare this file; GDAL fallback was used ({error})."
            )

    command = ["ogr2ogr", "-f", "Parquet", str(output), str(path), "-makevalid"]
    encoding = options.get("encoding")
    if encoding:
        command.extend(["-oo", f"ENCODING={encoding}"])
    longitude = options.get("longitudeColumn")
    latitude = options.get("latitudeColumn")
    if path.suffix.lower() == ".csv" and longitude and latitude:
        command.extend(
            [
                "-oo",
                f"X_POSSIBLE_NAMES={longitude}",
                "-oo",
                f"Y_POSSIBLE_NAMES={latitude}",
                "-a_srs",
                str(options.get("crs", "EPSG:4326")),
            ]
        )
    run_tool(command)
    return (
        [{"name": "GDAL", "version": tool_version(["ogr2ogr", "--version"])}],
        warnings,
    )


def prepare_pointcloud(path: Path, output: Path) -> list[dict[str, str]]:
    run_tool(["pdal", "translate", str(path), str(output), "-w", "writers.copc"])
    return [{"name": "PDAL", "version": tool_version(["pdal", "--version"])}]


def main(raw: dict[str, Any]) -> None:
    request = EarthStoriesConversionProtocolV1.model_validate(raw).root
    request_id = request.requestId
    path = Path(request.input.path)
    options = dict(request.options)
    stage = {
        "inspect": "inspecting",
        "configure": "inspecting",
        "prepare": "preparing",
        "verify": "verifying",
    }[request.operation.value]
    action = {
        "inspect": "Inspecting",
        "configure": "Configuring",
        "prepare": "Preparing",
        "verify": "Verifying",
    }[request.operation.value]
    emit(
        {
            "protocol": PROTOCOL,
            "requestId": request_id,
            "type": "progress",
            "stage": stage,
            "completed": 0,
            "total": 1,
            "unit": "steps",
            "message": f"{action} {request.input.filename}",
        }
    )

    tools: list[dict[str, str]] = []
    warnings: list[str] = []
    if request.operation.value in ("inspect", "configure"):
        if request.capability.value == "multidim":
            output, tools = inspect_multidim(path)
        elif path.suffix.lower() == ".csv":
            output = inspect_csv(path)
        else:
            output, tools = inspect_gdal(path)
    elif request.operation.value == "prepare":
        categories: list[dict[str, Any]] = []
        output_path = Path(str(options["outputPath"]))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if request.capability.value == "raster":
            tools, categories = prepare_raster(path, output_path)
        elif request.capability.value == "vector":
            tools, warnings = prepare_vector(path, output_path, options)
        elif request.capability.value == "pointcloud":
            tools = prepare_pointcloud(path, output_path)
        elif request.capability.value == "multidim":
            tools = prepare_multidim(path, output_path, options)
        else:
            raise ValueError(
                f"Prepare is not implemented for {request.capability.value}"
            )
        output = {"path": str(output_path), "sizeBytes": output_path.stat().st_size}
        if categories:
            output["categories"] = categories
    else:
        if request.capability.value == "raster":
            run_tool(["rio", "cogeo", "validate", str(path)])
            tools = [
                {
                    "name": "rio-cogeo",
                    "version": tool_version(["rio", "cogeo", "--version"]),
                }
            ]
        elif not path.is_file() or path.stat().st_size == 0:
            raise ValueError("Prepared output is missing or empty")
        output = {"valid": True, "sizeBytes": path.stat().st_size}

    emit(
        {
            "protocol": PROTOCOL,
            "requestId": request_id,
            "type": "result",
            "status": "succeeded",
            "output": output,
            "tools": tools,
            "warnings": warnings,
        }
    )


if __name__ == "__main__":
    raw: dict[str, Any] = {}
    try:
        raw = json.loads(sys.stdin.readline())
    except Exception as error:
        emit(
            {
                "protocol": PROTOCOL,
                "requestId": "unknown",
                "type": "failure",
                "status": "failed",
                "code": "invalid-request",
                "message": str(error),
                "retryable": False,
                "details": {},
            }
        )
        raise SystemExit(1) from error
    try:
        main(raw)
    except Exception as error:
        request_id = str(raw.get("requestId") or "unknown")
        emit(
            {
                "protocol": PROTOCOL,
                "requestId": request_id,
                "type": "failure",
                "status": "failed",
                "code": "worker-error",
                "message": str(error),
                "retryable": isinstance(error, ToolTimeoutError),
                "details": {},
            }
        )
        raise SystemExit(1) from error
