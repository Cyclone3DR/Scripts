//How to use it:
//1-Activate the UCS in which the coordinates were given
//2-Select the objects to move to their true location
//3-Run the script

//Inputs selection
var inputs=SComp.FromSel();

//Compute the matrix
var matCurrentUCS=SMatrix.FromActiveCS();
var matMovement=SMatrix.New();
matMovement.InitInverse(matCurrentUCS);

//Move the inputs
for(var i=0;i<inputs.length;i++){
    inputs[i].ApplyTransformation(matMovement);
}