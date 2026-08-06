import { spawn } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";

const pixi = resolve(
  process.argv[2] ??
    (platform() === "win32"
      ? ".earth-stories/bin/pixi.exe"
      : ".earth-stories/bin/pixi"),
);
const manifest = resolve("pixi.toml");
const checks = [
  ["core", "python", ["-c", "import pydantic; print(pydantic.__version__)"]],
  [
    "vector",
    "python",
    [
      "-c",
      "import duckdb, pyarrow; from osgeo import gdal; print(duckdb.__version__, pyarrow.__version__, gdal.VersionInfo())",
    ],
  ],
  [
    "raster",
    "python",
    [
      "-c",
      "import rasterio, rio_cogeo; from osgeo import gdal; print(rasterio.__version__, rio_cogeo.__version__, gdal.VersionInfo())",
    ],
  ],
  [
    "multidim",
    "python",
    [
      "-c",
      "import xarray, netCDF4, h5netcdf, zarr, rioxarray; print(xarray.__version__, netCDF4.__version__, h5netcdf.__version__, zarr.__version__, rioxarray.__version__)",
    ],
  ],
  ["pointcloud", "python", ["-c", "import pdal; print(pdal.__version__)"]],
];

for (const [environment, executable, args] of checks) {
  await new Promise((resolveCheck, rejectCheck) => {
    const child = spawn(
      pixi,
      [
        "run",
        "--manifest-path",
        manifest,
        "-e",
        environment,
        executable,
        ...args,
      ],
      { stdio: "inherit" },
    );
    child.once("error", rejectCheck);
    child.once("exit", (code) =>
      code === 0
        ? resolveCheck()
        : rejectCheck(
            new Error(`${environment} tool smoke failed with exit ${code}`),
          ),
    );
  });
}

process.stdout.write("All conversion capability tools loaded successfully.\n");
