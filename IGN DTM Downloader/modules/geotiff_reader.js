// File: geotiff_reader.js
//
// Minimal GeoTIFF reader for the "cartes.gouv.fr -> point clouds -> mesh" illustration script.
//
// Deliberately reduced scope (see design discussion):
//   - "Classic" TIFF only (no BigTIFF)
//   - Strip-based layout only, NO tiled TIFF (TileWidth/TileLength)
//   - Compression = 1 (no compression) only; no LZW/Deflate/JPEG
//   - Single band only (SamplesPerPixel = 1), typically elevation (float32),
//     but 8/16/32-bit integers (signed or unsigned) are also handled
//   - Simple GeoTIFF georeferencing: ModelPixelScaleTag (33550) + ModelTiepointTag (33922)
//     with a tiepoint at (I=0, J=0), no rotation or shear
//     (ModelTransformationTag is not supported)
//
// These limits cover the standard case of RGE ALTI tiles (uncompressed GeoTIFF, 1 band,
// north-up) and are enough to illustrate the 3DR script engine's "dynamic import()" API.
// For production use, prefer a full-featured GeoTIFF library.

const TAG = {
    IMAGE_WIDTH: 256,
    IMAGE_HEIGHT: 257,
    BITS_PER_SAMPLE: 258,
    COMPRESSION: 259,
    STRIP_OFFSETS: 273,
    SAMPLES_PER_PIXEL: 277,
    ROWS_PER_STRIP: 278,
    STRIP_BYTE_COUNTS: 279,
    SAMPLE_FORMAT: 339,
    TILE_WIDTH: 322,
    TILE_LENGTH: 323,
    MODEL_PIXEL_SCALE: 33550,
    MODEL_TIEPOINT: 33922,
    GEO_KEY_DIRECTORY: 34735,
    GDAL_NODATA: 42113
};

// GeoKey id for GTRasterTypeGeoKey, and its two possible values, within the
// GeoKeyDirectoryTag (34735). See the GeoTIFF specification.
const GT_RASTER_TYPE_GEO_KEY = 1025;
const RASTER_PIXEL_IS_AREA = 1;
const RASTER_PIXEL_IS_POINT = 2;

// Size in bytes of each TIFF field type (BYTE, ASCII, SHORT, LONG, RATIONAL, FLOAT, DOUBLE).
const FIELD_TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8 };

/**
 * Reads the value(s) of a single TIFF IFD entry.
 * @param {DataView} view The TIFF file as a DataView.
 * @param {boolean} littleEndian Byte order of the file.
 * @param {number} valueFieldOffset Offset of the entry's 4-byte value/offset field.
 * @param {number} fieldType The TIFF field type (1=BYTE, 2=ASCII, 3=SHORT, 4=LONG, 5=RATIONAL, 11=FLOAT, 12=DOUBLE).
 * @param {number} count Number of values stored in this entry.
 * @returns {string|number[]} A string for ASCII fields, otherwise an array of numbers.
 */
function readFieldValues(view, littleEndian, valueFieldOffset, fieldType, count)
{
    const typeSize = FIELD_TYPE_SIZE[fieldType];
    if (!typeSize)
    {
        throw new Error("Unsupported TIFF field type for this minimal reader: " + fieldType);
    }

    const totalBytes = typeSize * count;
    // If the value fits in the 4 reserved bytes of the IFD entry, it is stored there directly;
    // otherwise these 4 bytes contain an absolute offset to the data in the file.
    const dataOffset = totalBytes <= 4 ? valueFieldOffset : view.getUint32(valueFieldOffset, littleEndian);

    if (fieldType === 2) // ASCII
    {
        let text = "";
        for (let i = 0; i < count; i++)
        {
            const code = view.getUint8(dataOffset + i);
            if (code === 0)
            {
                break;
            }
            text += String.fromCharCode(code);
        }
        return text;
    }

    const values = [];
    for (let i = 0; i < count; i++)
    {
        switch (fieldType)
        {
            case 1: // BYTE
                values.push(view.getUint8(dataOffset + i));
                break;
            case 3: // SHORT
                values.push(view.getUint16(dataOffset + i * 2, littleEndian));
                break;
            case 4: // LONG
                values.push(view.getUint32(dataOffset + i * 4, littleEndian));
                break;
            case 5: { // RATIONAL (numerator / denominator, 2 LONG)
                const numerator = view.getUint32(dataOffset + i * 8, littleEndian);
                const denominator = view.getUint32(dataOffset + i * 8 + 4, littleEndian);
                values.push(denominator !== 0 ? numerator / denominator : 0);
                break;
            }
            case 11: // FLOAT
                values.push(view.getFloat32(dataOffset + i * 4, littleEndian));
                break;
            case 12: // DOUBLE
                values.push(view.getFloat64(dataOffset + i * 8, littleEndian));
                break;
            default:
                throw new Error("Unsupported TIFF field type for this minimal reader: " + fieldType);
        }
    }
    return values;
}

/**
 * Parses the TIFF header and the first IFD (Image File Directory) of a file.
 * @param {ArrayBuffer} arrayBuffer The binary content of the TIFF file.
 * @returns {{view: DataView, littleEndian: boolean, tags: object}} The raw file view,
 *   its byte order, and a map of tag id -> value(s) for the first IFD.
 */
function parseTiff(arrayBuffer)
{
    const view = new DataView(arrayBuffer);

    const byte0 = view.getUint8(0);
    const byte1 = view.getUint8(1);
    let littleEndian;
    if (byte0 === 0x49 && byte1 === 0x49) // "II"
    {
        littleEndian = true;
    }
    else if (byte0 === 0x4D && byte1 === 0x4D) // "MM"
    {
        littleEndian = false;
    }
    else
    {
        throw new Error("File not recognized as a TIFF (invalid byte order marker).");
    }

    const magicNumber = view.getUint16(2, littleEndian);
    if (magicNumber === 43)
    {
        throw new Error("BigTIFF is not supported by this minimal reader.");
    }
    if (magicNumber !== 42)
    {
        throw new Error("File not recognized as a TIFF (invalid magic number).");
    }

    const firstIfdOffset = view.getUint32(4, littleEndian);
    const entryCount = view.getUint16(firstIfdOffset, littleEndian);

    const tags = {};
    for (let i = 0; i < entryCount; i++)
    {
        const entryOffset = firstIfdOffset + 2 + i * 12;
        const tagId = view.getUint16(entryOffset, littleEndian);
        const fieldType = view.getUint16(entryOffset + 2, littleEndian);
        const count = view.getUint32(entryOffset + 4, littleEndian);
        tags[tagId] = readFieldValues(view, littleEndian, entryOffset + 8, fieldType, count);
    }

    return { view, littleEndian, tags };
}

/**
 * Creates a typed array able to hold `length` samples for the given TIFF sample encoding.
 * @param {number} length Number of samples the array must hold.
 * @param {number} bitsPerSample Bits per sample (8, 16, 32 or 64).
 * @param {number} sampleFormat TIFF SampleFormat tag value (1=unsigned int, 2=signed int, 3=IEEE float).
 * @returns {Float32Array|Float64Array|Int8Array|Uint8Array|Int16Array|Uint16Array|Int32Array|Uint32Array}
 */
function createSampleArray(length, bitsPerSample, sampleFormat)
{
    if (bitsPerSample === 32 && sampleFormat === 3) return new Float32Array(length);
    if (bitsPerSample === 64 && sampleFormat === 3) return new Float64Array(length);
    if (bitsPerSample === 16 && sampleFormat === 2) return new Int16Array(length);
    if (bitsPerSample === 16) return new Uint16Array(length);
    if (bitsPerSample === 32 && sampleFormat === 2) return new Int32Array(length);
    if (bitsPerSample === 32) return new Uint32Array(length);
    if (bitsPerSample === 8 && sampleFormat === 2) return new Int8Array(length);
    if (bitsPerSample === 8) return new Uint8Array(length);
    throw new Error("Unsupported BitsPerSample=" + bitsPerSample + " / SampleFormat=" + sampleFormat + " combination for this minimal reader.");
}

/**
 * Reads a single pixel sample at the given byte offset.
 * @param {DataView} view The TIFF file as a DataView.
 * @param {boolean} littleEndian Byte order of the file.
 * @param {number} byteOffset Absolute byte offset of the sample in the file.
 * @param {number} bitsPerSample Bits per sample (8, 16, 32 or 64).
 * @param {number} sampleFormat TIFF SampleFormat tag value (1=unsigned int, 2=signed int, 3=IEEE float).
 * @returns {number} The decoded sample value.
 */
function readSample(view, littleEndian, byteOffset, bitsPerSample, sampleFormat)
{
    if (bitsPerSample === 32 && sampleFormat === 3) return view.getFloat32(byteOffset, littleEndian);
    if (bitsPerSample === 64 && sampleFormat === 3) return view.getFloat64(byteOffset, littleEndian);
    if (bitsPerSample === 16 && sampleFormat === 2) return view.getInt16(byteOffset, littleEndian);
    if (bitsPerSample === 16) return view.getUint16(byteOffset, littleEndian);
    if (bitsPerSample === 32 && sampleFormat === 2) return view.getInt32(byteOffset, littleEndian);
    if (bitsPerSample === 32) return view.getUint32(byteOffset, littleEndian);
    if (bitsPerSample === 8 && sampleFormat === 2) return view.getInt8(byteOffset);
    if (bitsPerSample === 8) return view.getUint8(byteOffset);
    throw new Error("Unsupported BitsPerSample=" + bitsPerSample + " / SampleFormat=" + sampleFormat + " combination for this minimal reader.");
}

/**
 * Reads a contiguous run of pixel samples (one TIFF strip) starting at the given offset.
 * @param {DataView} view The TIFF file as a DataView.
 * @param {boolean} littleEndian Byte order of the file.
 * @param {number} stripByteOffset Absolute byte offset of the first sample of the strip.
 * @param {number} sampleCount Number of samples to read.
 * @param {number} bitsPerSample Bits per sample (8, 16, 32 or 64).
 * @param {number} sampleFormat TIFF SampleFormat tag value (1=unsigned int, 2=signed int, 3=IEEE float).
 * @returns {Float32Array|Float64Array|Int8Array|Uint8Array|Int16Array|Uint16Array|Int32Array|Uint32Array}
 */
function readStripSamples(view, littleEndian, stripByteOffset, sampleCount, bitsPerSample, sampleFormat)
{
    const bytesPerSample = bitsPerSample / 8;
    if (!Number.isInteger(bytesPerSample))
    {
        throw new Error("Unsupported BitsPerSample (must be a multiple of 8): " + bitsPerSample);
    }

    const samples = createSampleArray(sampleCount, bitsPerSample, sampleFormat);
    for (let i = 0; i < sampleCount; i++)
    {
        samples[i] = readSample(view, littleEndian, stripByteOffset + i * bytesPerSample, bitsPerSample, sampleFormat);
    }
    return samples;
}

/**
 * Reads GTRasterTypeGeoKey (id 1025) from a parsed GeoKeyDirectoryTag (34735), which
 * tells whether a georeferenced coordinate refers to the CORNER of a pixel
 * (RasterPixelIsArea) or directly to its CENTER (RasterPixelIsPoint). Per the GeoTIFF
 * specification, RasterPixelIsArea is the default when the key is absent.
 * @param {object} tags The tag map returned by parseTiff().
 * @returns {number} RASTER_PIXEL_IS_AREA (1) or RASTER_PIXEL_IS_POINT (2).
 */
function getRasterPixelType(tags)
{
    const geoKeyDirectory = tags[TAG.GEO_KEY_DIRECTORY];
    if (!geoKeyDirectory)
    {
        return RASTER_PIXEL_IS_AREA;
    }

    // Layout: 4 header shorts (KeyDirectoryVersion, KeyRevision, MinorRevision,
    // NumberOfKeys), then NumberOfKeys groups of 4 shorts (KeyID, TIFFTagLocation,
    // Count, Value/Offset). GTRasterTypeGeoKey is always stored inline (Count=1,
    // TIFFTagLocation=0), so the 4th short of its group is the value itself.
    const keyCount = geoKeyDirectory[3];
    for (let i = 0; i < keyCount; i++)
    {
        const groupOffset = 4 + i * 4;
        if (geoKeyDirectory[groupOffset] === GT_RASTER_TYPE_GEO_KEY)
        {
            return geoKeyDirectory[groupOffset + 3];
        }
    }

    return RASTER_PIXEL_IS_AREA;
}

/**
 * Decodes a single-band, uncompressed GeoTIFF into an elevation grid.
 * @param {ArrayBuffer} arrayBuffer The binary content of the TIFF file (e.g. from response.arrayBuffer()).
 * @returns {object} The elevation grid (see geotiff_reader.d.ts for the field details).
 */
export function readElevationGrid(arrayBuffer)
{
    const { view, littleEndian, tags } = parseTiff(arrayBuffer);

    if (tags[TAG.TILE_WIDTH] || tags[TAG.TILE_LENGTH])
    {
        throw new Error("Tiled TIFF is not supported by this minimal reader; only the strip-based layout is handled.");
    }

    const compression = tags[TAG.COMPRESSION] ? tags[TAG.COMPRESSION][0] : 1;
    if (compression !== 1)
    {
        throw new Error("Unsupported TIFF compression (code " + compression + "). Only the uncompressed format (Compression = 1) is handled by this minimal reader.");
    }

    if (!tags[TAG.IMAGE_WIDTH] || !tags[TAG.IMAGE_HEIGHT] || !tags[TAG.STRIP_OFFSETS])
    {
        throw new Error("Incomplete or unsupported TIFF structure (missing ImageWidth/ImageHeight/StripOffsets).");
    }

    const width = tags[TAG.IMAGE_WIDTH][0];
    const height = tags[TAG.IMAGE_HEIGHT][0];

    const samplesPerPixel = tags[TAG.SAMPLES_PER_PIXEL] ? tags[TAG.SAMPLES_PER_PIXEL][0] : 1;
    if (samplesPerPixel !== 1)
    {
        throw new Error("Only single-band (elevation) images are supported; this file has " + samplesPerPixel + ".");
    }

    const bitsPerSample = tags[TAG.BITS_PER_SAMPLE] ? tags[TAG.BITS_PER_SAMPLE][0] : 8;
    const sampleFormat = tags[TAG.SAMPLE_FORMAT] ? tags[TAG.SAMPLE_FORMAT][0] : 1;
    const rowsPerStrip = tags[TAG.ROWS_PER_STRIP] ? tags[TAG.ROWS_PER_STRIP][0] : height;
    const stripOffsets = tags[TAG.STRIP_OFFSETS];

    const values = createSampleArray(width * height, bitsPerSample, sampleFormat);
    let destIndex = 0;
    for (let stripIndex = 0; stripIndex < stripOffsets.length; stripIndex++)
    {
        const rowsInThisStrip = Math.min(rowsPerStrip, height - stripIndex * rowsPerStrip);
        const sampleCount = width * rowsInThisStrip;
        const stripSamples = readStripSamples(view, littleEndian, stripOffsets[stripIndex], sampleCount, bitsPerSample, sampleFormat);
        values.set(stripSamples, destIndex);
        destIndex += sampleCount;
    }

    const pixelScale = tags[TAG.MODEL_PIXEL_SCALE];
    const tiepoint = tags[TAG.MODEL_TIEPOINT];
    const hasGeoreferencing = !!(pixelScale && tiepoint);

    let originX = 0, originY = 0, pixelSizeX = 1, pixelSizeY = 1;
    if (hasGeoreferencing)
    {
        if (tiepoint[0] !== 0 || tiepoint[1] !== 0)
        {
            throw new Error("Non-zero GeoTIFF tiepoint (ModelTiepointTag with I,J != 0) is not supported by this minimal reader.");
        }
        pixelSizeX = pixelScale[0];
        pixelSizeY = pixelScale[1];
        originX = tiepoint[3];
        originY = tiepoint[4];
    }

    const pixelIsPoint = getRasterPixelType(tags) === RASTER_PIXEL_IS_POINT;

    const noDataText = tags[TAG.GDAL_NODATA];
    const noData = noDataText !== undefined ? parseFloat(noDataText) : null;

    return {
        width,
        height,
        originX,
        originY,
        pixelSizeX,
        pixelSizeY,
        pixelIsPoint,
        hasGeoreferencing,
        noData,
        values,
        getElevation(row, col)
        {
            return values[row * width + col];
        }
    };
}

/**
 * Walks an elevation grid and invokes callback(x, y, z) for each valid point,
 * converting each pixel into terrain coordinates via the grid's georeferencing.
 * Points whose value equals grid.noData are skipped.
 * @param {object} grid A grid returned by readElevationGrid().
 * @param {number} step Sampling step in pixels (1 = every pixel, 2 = every other pixel, ...).
 * @param {(x: number, y: number, z: number) => void} callback Called for each valid point.
 */
export function forEachPoint(grid, step, callback)
{
    const sampleStep = step && step > 0 ? Math.round(step) : 1;

    // RasterPixelIsArea (the common/default case): the tiepoint gives the CORNER of
    // pixel (0,0), so we need to add half a pixel to reach its center.
    // RasterPixelIsPoint: the tiepoint already IS the center of pixel (0,0), no offset.
    const centerOffset = grid.pixelIsPoint ? 0 : 0.5;

    for (let row = 0; row < grid.height; row += sampleStep)
    {
        const y = grid.originY - (row + centerOffset) * grid.pixelSizeY;
        for (let col = 0; col < grid.width; col += sampleStep)
        {
            const z = grid.values[row * grid.width + col];
            if (grid.noData !== null && z === grid.noData)
            {
                continue;
            }
            const x = grid.originX + (col + centerOffset) * grid.pixelSizeX;
            callback(x, y, z);
        }
    }
}
