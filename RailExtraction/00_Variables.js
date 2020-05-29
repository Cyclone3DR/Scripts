/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>

// stack
var C_STACK_WIDTH = 0.065; // 6.5cm
var C_STACK_HEIGHT = 0.153; // 15.3cm
var C_STACK_SPACING = 1.435; // 1.435m // space between two stacks

// error allowed
var C_MAXIMAL_DEVIATION_ERROR = 0.0015; // 1.5cm

var C_STACK_TRACK_RATIOPOSITION = 0.333;
// 0.5: TRACK is positionned in the middle of the rails
// 0.3: TRACK is positionned on the left
// 0.7: TRACK is positionned on the right



// dimension of the extracted objects
var C_SPHERE_RADIUS = C_STACK_SPACING*0.33; // ~50cm
			// if the sphere radius is important -> the ground will be better extracted (best plane)
			// if the sphere radius is small -> less noise (0.5 seems to be a good choise)

var C_STACK_HEIGHT_TO_DELETE = C_STACK_HEIGHT*0.33; // ~5cm