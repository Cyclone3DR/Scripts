// ------------------------ HOW TO USE IT --------------------------------------------
// 1. Select the cloud(s) that must be used to generate the mesh. Be sure that they are cleaned and aligned is necessary.
// 2. Run one the 3 modes for choosing the meshing strategy: precise, normal, fast. 
//    For each mode, the workflow is: 
//        1) make a 3dmesh, 
//        2)reduce the mesh with deviation to reduce the triangle density in flat areas, 
//        3) refine the mesh using the input cloud(s)
// NOTE:
// by default all values are in MM, however you can adjust them using the scaleFactor parameter.
// NOTE:
// the general workflow is inside MeshWizard_General.js file. If you need more information regarding parameters, just open this file.
//
// Parameter explanations:
// 1. mesh_pointSpacing: parameter used to generate the first rough mesh (it corresponds to the 3d mesh that can be use in the UI)
// 2. mesh_sizeTriHole: size of the hole to detect (by default 3 times the mesh_pointSpacing). Use only if mesh_optionHole is set to NO_CLOSED. 
// 3. mesh_optionHole: Hole detection strategy. By default, detect holes that are greater than mesh_sizeTriHole. Can be INSIDE_CLOSED or ALL_CLOSED 
// 4. reduce_deviation: This parameter is used during the reduction, in order to reduce triangle density only in flat areas. 
// 5. reduce_maxedgelength: When we reduce triangles in flat area, we want to keep a maximum edge length in order to avoid too big triangles.
// 6. refine_deviationError: The last step is used for refine. This parameter is used to add triangles inside curved areas.
// 7. refine_maxTriNumber: Control the maximum number of triangles inside the final mesh.
// 8. refine_minTriSize: Also control the triangle size that are allowed in order to avoid too many triangles in cirved areas that can be noisy.
/**
 * @param {inputs} All cloud that must be use to generate the mesh
 * @param {meshingStrategy} the meshing strategy: precise, normal, fast
 */
function generateMeshWizard(inputs, meshingStrategy, scaleFactor) {
    var inputError = true;
    var info = "";

    // 1 - 3dmesh parameter
    var mesh_pointSpacing;
    var mesh_sizeTriHole;
    var mesh_optionHole = SPoly.NO_CLOSED;	//can be 

    // 2 - reduce deviation parameter
    var reduce_deviation;
    var reduce_maxedgelength;

    // 3 - refine  parameter
    var refine_deviationError;
    var refine_maxTriNumber;
    var refine_minTriSize;
    var refine_maxdist;

    //preset settings
    if (meshingStrategy == 1) { //precise 
        mesh_pointSpacing = 1 * scaleFactor;
        refine_deviationError = 0.005 * scaleFactor;

    }
    if (meshingStrategy == 2) {	//normal
        mesh_pointSpacing = 1.5 * scaleFactor;
        refine_deviationError = 0.012 * scaleFactor;
    }
    if (meshingStrategy == 3) {	//fast 
        mesh_pointSpacing = 4 * scaleFactor;
        refine_deviationError = 0.04 * scaleFactor;
    }

    //meshing parameter
    mesh_sizeTriHole = 3 * mesh_pointSpacing;

    //reduce parameter
    reduce_deviation = mesh_pointSpacing / 50.0;
    reduce_maxedgelength = mesh_pointSpacing * 5.0;

    //refine parameter  
    refine_maxTriNumber = 5000000;
    refine_minTriSize = refine_deviationError;
    refine_maxdist = mesh_pointSpacing / 2.0;

    //meshing algo
    var step0 = SCloud.Merge(inputs);
    if (!step0.ErrorCode) {
        var step1 = SPoly.Direct3DMesh(
            step0.Cloud,
            0.0,
            mesh_pointSpacing,
            mesh_optionHole,
            mesh_sizeTriHole,
            false);
        if (!step1.ErrorCode) {
            var step2 = step1.Poly.ReduceDeviation(
                reduce_deviation,
                SPoly.KEEP_EQUI,
                false,
                0,
                0,
                reduce_maxedgelength
            );
            if (!step2.ErrorCode) {
                var step3 = step1.Poly.RemeshRefineDev(
                    refine_deviationError,
                    refine_minTriSize,
                    refine_maxTriNumber,
                    SPoly.NO_CHANGE,
                    refine_maxdist,
                    0,
                    step0.Cloud,
                    0.1);
                if (!step3.ErrorCode) {
                    var outputMesh = step3.Poly;
                }
                else {
                    throw new Error("RemeshRefineDev Error");
                }
            }
            else {
                throw new Error("ReduceDeviation Error");
            }
        }
        else {
            throw new Error("Direct3Dmesh Error");
        }
    }
    else {
        throw new Error("MergeClouds Error");
    }

    return step3.Poly;
}