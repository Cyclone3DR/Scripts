// File: geotiff_reader.d.ts
// Definitions for geotiff_reader.js autocompletion in the Cyclone 3DR script editor.

export interface ElevationGrid {
    width: number;
    height: number;
    originX: number;
    originY: number;
    pixelSizeX: number;
    pixelSizeY: number;
    /** True if coordinates refer to the pixel center (RasterPixelIsPoint); false if they
     * refer to the pixel corner (RasterPixelIsArea, the GeoTIFF default). */
    pixelIsPoint: boolean;
    hasGeoreferencing: boolean;
    noData: number | null;
    values: Float32Array | Float64Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;
    getElevation(row: number, col: number): number;
}

export function readElevationGrid(arrayBuffer: ArrayBuffer): ElevationGrid;

export function forEachPoint(
    grid: ElevationGrid,
    step: number,
    callback: (x: number, y: number, z: number) => void
): void;
