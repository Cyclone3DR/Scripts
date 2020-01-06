/// <reference path="C:\Program Files\3DReshaper_18.1_x64\docScript\Reshaper.d.ts"/>

// stack
var C_STACK_WIDTH = 0.065; // 6.5cm
var C_STACK_HEIGHT = 0.153; // 15.3cm
var C_STACK_SPACING = 1.435; // 1.435m // space between two stacks

// error allowed
var C_MAXIMAL_DEVIATION_ERROR = 0.0015; // 1.5cm



// dimension of the extracted objects
var C_SPHERE_RADIUS = C_STACK_SPACING*0.33; // ~50cm
			// if the sphere radius is important -> the ground will be better extracted (best plane)
			// if the sphere radius is small -> less noise (0.5 seems to be a good choise)

var C_STACK_HEIGHT_TO_DELETE = C_STACK_HEIGHT*0.33; // ~5cm