import * as THREE from 'three';

/** Markings live on the asphalt itself; longitudinal masks cut the dashed sections. */
export function roadPaintMaterial(length:number){
 const material=new THREE.MeshStandardMaterial({color:'#37394b',roughness:1});
 material.name='asphalt-with-painted-markings';
 material.userData.roadLength={value:length};
 material.onBeforeCompile=shader=>{
  shader.uniforms.roadLength=material.userData.roadLength;
  shader.vertexShader='attribute vec2 roadCoord; varying vec2 vRoadCoord;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRoadCoord=roadCoord;');
  shader.fragmentShader='varying vec2 vRoadCoord; uniform float roadLength;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    // Distances stay in road metres, so the pattern does not stretch around curves.
    float along=vRoadCoord.y;
    float route=along/roadLength;
    float across=vRoadCoord.x;
    float grain=fract(sin(dot(floor(vRoadCoord*65.0),vec2(12.9898,78.233)))*43758.5453);
    float fleck=fract(sin(dot(floor(vRoadCoord*150.0),vec2(41.32,19.17)))*12345.678);
    float aa=max(fwidth(across),0.006);
    float edgeWear=(grain-.5)*.014;
    // A short single-line section merges smoothly out of the double centre line.
    float single=smoothstep(.68,.705,route)*(1.0-smoothstep(.84,.865,route));
    float leftCenter=mix(-.17,0.0,single);
    float rightCenter=mix(.17,0.0,single);
    float left=1.0-smoothstep(.065-aa,.065+aa,abs(across-leftCenter)+edgeWear);
    float right=(1.0-smoothstep(.065-aa,.065+aa,abs(across-rightCenter)+edgeWear))*(1.0-single);
    float period=9.0;
    float dashAt=mod(along,period);
    float dashAA=max(fwidth(along),.025);
    float dash=smoothstep(0.0,dashAA,dashAt)*(1.0-smoothstep(4.0-dashAA,4.0+dashAA,dashAt));
    float leftDashed=smoothstep(.22,.225,route)*(1.0-smoothstep(.36,.365,route));
    float rightDashed=smoothstep(.48,.485,route)*(1.0-smoothstep(.61,.615,route));
    left*=mix(1.0,dash,leftDashed);
    right*=mix(1.0,dash,rightDashed);
    float centerPaint=max(left,right);
    float edgePaint=1.0-smoothstep(.075-aa,.075+aa,abs(abs(across)-4.43)+edgeWear);
    // Pigment catches the aggregate. Sparse pinholes and soft worn edges keep it matte.
    float pigment=mix(.80,1.0,grain)*(1.0-step(.986,fleck)*.6);
    diffuseColor.rgb*=.93+.10*grain;
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.66,.49,.18),centerPaint*pigment);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.70,.70,.62),edgePaint*pigment);
  `);
 };
 material.customProgramCacheKey=()=> 'factory-road-paint-v1';
 return material;
}
