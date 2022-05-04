export function changeColorOnIntersect(raycaster, meshes)
{
  for (var i = meshes.length - 1; i >= 0; i--)
  {
    const intersection = raycaster.intersectObject( meshes[i] );
    if ( intersection.length > 0 ) {
      meshes[i].material.color.setHex(Math.random() * 0xffffff);
      return meshes[i];
    }
  }
  return null;
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
