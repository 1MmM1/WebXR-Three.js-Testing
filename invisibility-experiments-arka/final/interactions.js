export function changeColorOnIntersect(raycaster, mesh)
{
  const intersection = raycaster.intersectObject( mesh );
  console.log(intersection);
  if ( intersection.length > 0 ) {
    mesh.material.color.setHex(Math.random() * 0xffffff);
  }
}

export function sendProgrammedRaycasts(raycaster, meshes)
{
  const startVector = new THREE.Vector3(0,5,0);

  console.log(raycaster);
  for (var i = 0; i < meshes.length; i++)
  {
    const direction = new THREE.Vector3(0,0,0);
    direction.subVectors( mesh.position, startVector).normalize();
    raycaster.set(startVector, direction);
    changeColorOnIntersect(meshes[i]);
  }
  alert("I've taken over");
};
